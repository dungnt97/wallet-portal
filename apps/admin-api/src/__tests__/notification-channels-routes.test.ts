import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
// Route handler tests for notification-channels.routes.ts
// Tests: GET /notification-channels
// Uses Fastify inject + mocked DB
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ──────────────────────────────────────────────────────────────

const STAFF_ID = '00000000-0000-0000-0000-000000000001';
const CHANNEL_ID = '00000000-0000-0000-0000-000000000002';

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    kind: 'slack' as const,
    name: 'ops-alerts',
    enabled: true,
    severityFilter: 'err',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    eventType: 'withdrawal.created',
    channelKind: 'slack' as const,
    severity: 'err' as const,
    enabled: true,
    ...overrides,
  };
}

async function buildApp(
  opts: {
    channelRows?: Record<string, unknown>[];
    ruleRows?: Record<string, unknown>[];
  } = {}
) {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const channelRows = opts.channelRows ?? [makeChannel()];
  const ruleRows = opts.ruleRows ?? [makeRule()];

  // Two select() calls: channels (orderBy chain), rules (where chain)
  let callN = 0;
  const mockSelect = vi.fn(() => {
    callN++;
    if (callN === 1) {
      return {
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(channelRows),
        }),
      };
    }
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(ruleRows),
      }),
    };
  });

  app.decorate('db', { select: mockSelect } as never);

  app.addHook('preHandler', async (req) => {
    req.session = {
      staff: { id: STAFF_ID, role: 'admin' },
    } as unknown as typeof req.session;
  });

  const { default: notifChannelsRoutes } = await import(
    '../routes/notification-channels.routes.js'
  );
  await app.register(notifChannelsRoutes);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /notification-channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns channels and eventKinds', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.channels)).toBe(true);
    expect(Array.isArray(body.eventKinds)).toBe(true);
    await app.close();
  });

  it('maps channel fields correctly', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ch = body.channels[0];
    expect(ch.id).toBe(CHANNEL_ID);
    expect(ch.kind).toBe('slack');
    expect(ch.label).toBe('ops-alerts');
    expect(ch.enabled).toBe(true);
    expect(ch.filter).toBe('err');
    await app.close();
  });

  it('derives eventKinds from routing rules', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ek = body.eventKinds[0];
    expect(ek.id).toBe('withdrawal.created');
    expect(ek.routed).toContain('slack');
    await app.close();
  });

  it('uses well-known label for known event types', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    const body = JSON.parse(res.body);
    const ek = body.eventKinds.find((e: { id: string }) => e.id === 'withdrawal.created');
    expect(ek?.label).toBe('Withdrawal created');
    await app.close();
  });

  it('returns empty arrays when no data', async () => {
    const app = await buildApp({ channelRows: [], ruleRows: [] });
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.channels).toEqual([]);
    expect(body.eventKinds).toEqual([]);
    await app.close();
  });

  it('aggregates multiple channel kinds for same event', async () => {
    const rules = [
      makeRule({ channelKind: 'slack' }),
      makeRule({ id: '00000000-0000-0000-0000-000000000011', channelKind: 'email' }),
    ];
    const app = await buildApp({ ruleRows: rules });
    const res = await app.inject({ method: 'GET', url: '/notification-channels' });
    const body = JSON.parse(res.body);
    const ek = body.eventKinds.find((e: { id: string }) => e.id === 'withdrawal.created');
    expect(ek?.routed).toContain('slack');
    expect(ek?.routed).toContain('email');
    await app.close();
  });
});
