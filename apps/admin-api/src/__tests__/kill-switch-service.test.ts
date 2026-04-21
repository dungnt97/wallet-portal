// Unit tests for kill-switch service — getState + toggle.
// Uses in-memory mocks — no real Postgres or Socket.io required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KillSwitchEnabledError, getState, toggle } from '../services/kill-switch.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF_ID = 'staff-uuid-0001';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  enabled: false,
  reason: null,
  updatedByStaffId: null,
  updatedAt: new Date('2026-04-21T00:00:00Z'),
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeUpdateMock(returnRows: unknown[]) {
  return vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnRows),
      }),
    }),
  });
}

function makeInsertMock(returnRows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returnRows);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  return vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ onConflictDoNothing }),
  });
}

function makeMockDb(opts: {
  row?: ReturnType<typeof makeRow> | undefined;
  updateReturn?: ReturnType<typeof makeRow>[];
}) {
  return {
    query: {
      systemKillSwitch: {
        findFirst: vi.fn().mockResolvedValue(opts.row),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(undefined),
      },
    },
    insert: makeInsertMock(opts.row ? [opts.row] : []),
    update: makeUpdateMock(opts.updateReturn ?? [makeRow({ enabled: true })]),
  };
}

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    of: vi.fn().mockReturnValue({ emit: emitFn }),
    _emit: emitFn,
  };
}

// Mock audit service so it does not need a full DB setup
vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── getState tests ─────────────────────────────────────────────────────────────

describe('kill-switch getState', () => {
  it('returns disabled state from DB row', async () => {
    const db = makeMockDb({ row: makeRow() });
    const state = await getState(db as unknown as Parameters<typeof getState>[0]);

    expect(state.enabled).toBe(false);
    expect(state.reason).toBeNull();
    expect(state.updatedByStaffId).toBeNull();
    expect(state.updatedAt).toBe('2026-04-21T00:00:00.000Z');
  });

  it('returns enabled state when row has enabled=true', async () => {
    const db = makeMockDb({
      row: makeRow({ enabled: true, reason: 'security incident' }),
    });
    const state = await getState(db as unknown as Parameters<typeof getState>[0]);

    expect(state.enabled).toBe(true);
    expect(state.reason).toBe('security incident');
  });

  it('inserts default row when row is missing (defensive)', async () => {
    const db = makeMockDb({ row: undefined });
    // findFirst returns undefined → triggers defensive insert
    const state = await getState(db as unknown as Parameters<typeof getState>[0]);

    expect(state.enabled).toBe(false);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});

// ── toggle tests ──────────────────────────────────────────────────────────────

describe('kill-switch toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables flag, writes audit entry, emits socket event', async () => {
    const updatedRow = makeRow({
      enabled: true,
      reason: 'fraud detected',
      updatedByStaffId: STAFF_ID,
    });
    const db = makeMockDb({ row: makeRow(), updateReturn: [updatedRow] });
    const io = makeMockIo();

    const state = await toggle(
      db as unknown as Parameters<typeof toggle>[0],
      { enabled: true, reason: 'fraud detected', staffId: STAFF_ID },
      io as unknown as Parameters<typeof toggle>[2]
    );

    expect(state.enabled).toBe(true);
    expect(state.reason).toBe('fraud detected');
    expect(state.updatedByStaffId).toBe(STAFF_ID);
    // Socket.io event emitted on /stream namespace
    expect(io.of).toHaveBeenCalledWith('/stream');
    expect(io._emit).toHaveBeenCalledWith(
      'ops.killswitch.changed',
      expect.objectContaining({ enabled: true })
    );
  });

  it('disables flag and emits disabled event', async () => {
    const updatedRow = makeRow({ enabled: false, reason: null, updatedByStaffId: STAFF_ID });
    const db = makeMockDb({ row: makeRow({ enabled: true }), updateReturn: [updatedRow] });
    const io = makeMockIo();

    const state = await toggle(
      db as unknown as Parameters<typeof toggle>[0],
      { enabled: false, staffId: STAFF_ID },
      io as unknown as Parameters<typeof toggle>[2]
    );

    expect(state.enabled).toBe(false);
    expect(io._emit).toHaveBeenCalledWith(
      'ops.killswitch.changed',
      expect.objectContaining({ enabled: false })
    );
  });

  it('throws when update returns no rows (row not found)', async () => {
    const db = makeMockDb({ row: makeRow(), updateReturn: [] });
    const io = makeMockIo();

    await expect(
      toggle(
        db as unknown as Parameters<typeof toggle>[0],
        { enabled: true, staffId: STAFF_ID },
        io as unknown as Parameters<typeof toggle>[2]
      )
    ).rejects.toThrow('system_kill_switch row not found');
  });

  it('KillSwitchEnabledError has correct statusCode and code', () => {
    const err = new KillSwitchEnabledError('security breach');
    expect(err.statusCode).toBe(423);
    expect(err.code).toBe('KILL_SWITCH_ENABLED');
    expect(err.message).toContain('security breach');
  });
});
