// Unit tests for ceremony-resume service — boot-time re-queue of orphaned ceremonies,
// stale partial ceremony admin notification.
// Uses in-memory mocks — no real Postgres, BullMQ, or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeInFlightCeremonies } from '../services/ceremony-resume.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { notifyStaff } from '../services/notify-staff.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeCeremony = (overrides: Record<string, unknown> = {}) => ({
  id: 'ceremony-uuid-001',
  operationType: 'signer_add',
  status: 'in_progress',
  chainStates: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makePartialCeremony = (ageMs = 2 * 60 * 60 * 1000) => ({
  ...makeCeremony({
    id: 'ceremony-uuid-partial-001',
    status: 'partial',
    updatedAt: new Date(Date.now() - ageMs),
  }),
});

// ── Mock builders ─────────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  };
  return chain;
}

function buildMockDb(
  opts: {
    inFlightCeremonies?: unknown[];
    staleCeremonies?: unknown[];
  } = {}
) {
  const inFlight = opts.inFlightCeremonies ?? [];
  const stale = opts.staleCeremonies ?? [];
  let callCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callCount++;
      return buildSelectChain(callCount === 1 ? inFlight : stale);
    }),
  };
}

function makeMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-001' }) };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return { of: vi.fn().mockReturnValue({ emit: emitFn }), _emit: emitFn };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resumeInFlightCeremonies service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — re-enqueues both chains for an in_progress ceremony', async () => {
    const db = buildMockDb({ inFlightCeremonies: [makeCeremony()] });
    const queue = makeMockQueue();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    const result = await resumeInFlightCeremonies(
      db as unknown as Parameters<typeof resumeInFlightCeremonies>[0],
      queue as unknown as Parameters<typeof resumeInFlightCeremonies>[1],
      io as unknown as Parameters<typeof resumeInFlightCeremonies>[2],
      emailQ as unknown as Parameters<typeof resumeInFlightCeremonies>[3],
      slackQ as unknown as Parameters<typeof resumeInFlightCeremonies>[4]
    );

    // 2 chains (bnb + sol) × 1 ceremony = 2 queue.add calls
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(result.requeued).toBe(2);
    expect(result.partialStaleNotified).toBe(0);
  });

  it('skips confirmed chain states — does not re-enqueue', async () => {
    const ceremony = makeCeremony({
      chainStates: { bnb: { status: 'confirmed' }, solana: { status: 'confirmed' } },
    });
    const db = buildMockDb({ inFlightCeremonies: [ceremony] });
    const queue = makeMockQueue();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    const result = await resumeInFlightCeremonies(
      db as unknown as Parameters<typeof resumeInFlightCeremonies>[0],
      queue as unknown as Parameters<typeof resumeInFlightCeremonies>[1],
      io as unknown as Parameters<typeof resumeInFlightCeremonies>[2],
      emailQ as unknown as Parameters<typeof resumeInFlightCeremonies>[3],
      slackQ as unknown as Parameters<typeof resumeInFlightCeremonies>[4]
    );

    expect(queue.add).not.toHaveBeenCalled();
    expect(result.requeued).toBe(0);
  });

  it('notifies admins for stale partial ceremonies (> 1h old)', async () => {
    const db = buildMockDb({ staleCeremonies: [makePartialCeremony()] });
    const queue = makeMockQueue();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    const result = await resumeInFlightCeremonies(
      db as unknown as Parameters<typeof resumeInFlightCeremonies>[0],
      queue as unknown as Parameters<typeof resumeInFlightCeremonies>[1],
      io as unknown as Parameters<typeof resumeInFlightCeremonies>[2],
      emailQ as unknown as Parameters<typeof resumeInFlightCeremonies>[3],
      slackQ as unknown as Parameters<typeof resumeInFlightCeremonies>[4]
    );

    expect(notifyStaff).toHaveBeenCalledTimes(1);
    expect(result.partialStaleNotified).toBe(1);
  });

  it('returns zeros when no ceremonies are in-flight or stale', async () => {
    const db = buildMockDb();
    const queue = makeMockQueue();
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    const result = await resumeInFlightCeremonies(
      db as unknown as Parameters<typeof resumeInFlightCeremonies>[0],
      queue as unknown as Parameters<typeof resumeInFlightCeremonies>[1],
      io as unknown as Parameters<typeof resumeInFlightCeremonies>[2],
      emailQ as unknown as Parameters<typeof resumeInFlightCeremonies>[3],
      slackQ as unknown as Parameters<typeof resumeInFlightCeremonies>[4]
    );

    expect(result).toEqual({ requeued: 0, partialStaleNotified: 0 });
  });

  it('tolerates duplicate BullMQ job error (job already waiting) — does not throw', async () => {
    const db = buildMockDb({ inFlightCeremonies: [makeCeremony()] });
    const queue = { add: vi.fn().mockRejectedValue(new Error('Job is already waiting')) };
    const io = makeMockIo();
    const emailQ = makeMockQueue();
    const slackQ = makeMockQueue();

    // Should not throw — duplicate jobs are silently ignored
    await expect(
      resumeInFlightCeremonies(
        db as unknown as Parameters<typeof resumeInFlightCeremonies>[0],
        queue as unknown as Parameters<typeof resumeInFlightCeremonies>[1],
        io as unknown as Parameters<typeof resumeInFlightCeremonies>[2],
        emailQ as unknown as Parameters<typeof resumeInFlightCeremonies>[3],
        slackQ as unknown as Parameters<typeof resumeInFlightCeremonies>[4]
      )
    ).resolves.toBeDefined();
  });
});
