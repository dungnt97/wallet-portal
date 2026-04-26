import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for ops-kill-switch.routes.ts
// Tests: GET /ops/kill-switch, POST /ops/kill-switch
// Uses Fastify inject + mocked kill-switch service
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ────────────────────────────────────��─────────────────────────

vi.mock('../services/kill-switch.service.js', () => ({
  getState: vi.fn(),
  toggle: vi.fn(),
  KillSwitchEnabledError: class KillSwitchEnabledError extends Error {
    code = 'KILL_SWITCH_ENABLED';
    constructor(m: string) {
      super(m);
      this.name = 'KillSwitchEnabledError';
    }
  },
}));

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

// ── Test helpers ────────────────────────────────────���─────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeKillSwitchState(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    reason: null,
    updatedByStaffId: STAFF_ID,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function buildApp(
  opts: {
    role?: string;
    getStateFn?: () => Promise<unknown>;
    toggleFn?: (...args: unknown[]) => Promise<unknown>;
  } = {}
) {
  // Bypass WebAuthn step-up in tests
  process.env.POLICY_DEV_MODE = 'true';

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('db', {} as never);
  app.decorate('io', { of: vi.fn().mockReturnValue({ emit: vi.fn() }) } as never);
  app.decorate('emailQueue', { add: vi.fn() } as never);
  app.decorate('slackQueue', { add: vi.fn() } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: opts.role ?? 'admin' },
    } as unknown as typeof req.session;
  });

  const { getState, toggle } = await import('../services/kill-switch.service.js');

  vi.mocked(getState).mockImplementation(
    (opts.getStateFn ?? (async () => makeKillSwitchState())) as typeof getState
  );

  vi.mocked(toggle).mockImplementation(
    (opts.toggleFn ?? (async () => makeKillSwitchState({ enabled: true }))) as typeof toggle
  );

  const { default: opsKillSwitchRoutes } = await import('../routes/ops-kill-switch.routes.js');
  await app.register(opsKillSwitchRoutes);
  await app.ready();
  return app;
}

// ── Tests: GET /ops/kill-switch ───────────────────────────────────────────────

describe('GET /ops/kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current kill-switch state', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ops/kill-switch' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enabled).toBe(false);
    expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('returns enabled=true when kill-switch is on', async () => {
    const app = await buildApp({
      getStateFn: async () => makeKillSwitchState({ enabled: true, reason: 'security incident' }),
    });
    const res = await app.inject({ method: 'GET', url: '/ops/kill-switch' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enabled).toBe(true);
    expect(body.reason).toBe('security incident');
    await app.close();
  });
});

// ── Tests: POST /ops/kill-switch ───────────────────��──────────────────────────

describe('POST /ops/kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles kill-switch on and returns new state', async () => {
    const app = await buildApp({
      toggleFn: async () => makeKillSwitchState({ enabled: true, reason: 'manual pause' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ops/kill-switch',
      payload: { enabled: true, reason: 'manual pause' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enabled).toBe(true);
    await app.close();
  });

  it('toggles kill-switch off', async () => {
    const app = await buildApp({
      toggleFn: async () => makeKillSwitchState({ enabled: false }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ops/kill-switch',
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enabled).toBe(false);
    await app.close();
  });

  it('returns 423 on KillSwitchEnabledError', async () => {
    const { KillSwitchEnabledError } = await import('../services/kill-switch.service.js');
    const app = await buildApp({
      toggleFn: async () => {
        throw new KillSwitchEnabledError('already enabled');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ops/kill-switch',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(423);
    expect(JSON.parse(res.body).code).toBe('KILL_SWITCH_ENABLED');
    await app.close();
  });

  it('returns 400 for missing enabled field', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/ops/kill-switch',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
