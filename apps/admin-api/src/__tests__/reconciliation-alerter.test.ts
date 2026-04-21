// Unit tests for reconciliation-alerter.service.
// Tests: critical drift fires notifyStaff with severity=critical,
//        warning-only fires warning, zero drifts fires info to admins only.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/notify-staff.service.js', () => ({
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { notifyStaff } from '../services/notify-staff.service.js';
import { alertOnSnapshotComplete } from '../services/reconciliation-alerter.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SNAP_ID = 'snap-alert-0001-0000-0000-000000000001';

const mockDb = {} as never;
const mockIo = {} as never;
const mockEmailQ = {} as never;
const mockSlackQ = {} as never;

// ── Helper ────────────────────────────────────────────────────────────────────

/** Extracts the NotifyStaffInput from the first mock.calls entry without non-null assertions */
function getFirstCallInput() {
  const calls = vi.mocked(notifyStaff).mock.calls;
  if (calls.length === 0) throw new Error('notifyStaff was not called');
  const call = calls[0];
  if (!call) throw new Error('notifyStaff call[0] is undefined');
  return call[2]; // [db, io, input]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reconciliation-alerter — critical drift', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls notifyStaff with severity=critical when criticalCount > 0', async () => {
    await alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
      snapshotId: SNAP_ID,
      driftCount: 3,
      criticalCount: 2,
      warningCount: 1,
      driftTotalMinor: 500_000_000n,
    });

    expect(notifyStaff).toHaveBeenCalledOnce();
    const input = getFirstCallInput();
    expect(input.severity).toBe('critical');
    expect(input.eventType).toBe('reconciliation.drift.critical');
    expect(input.dedupeKey).toBe(SNAP_ID);
  });

  it('uses operator role so ops + admins receive the alert', async () => {
    await alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
      snapshotId: SNAP_ID,
      driftCount: 1,
      criticalCount: 1,
      warningCount: 0,
      driftTotalMinor: 50_000_000_000n,
    });

    const input = getFirstCallInput();
    expect(input.role).toBe('operator');
  });
});

describe('reconciliation-alerter — warning only', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls notifyStaff with severity=warning when no criticals but warnings exist', async () => {
    await alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
      snapshotId: SNAP_ID,
      driftCount: 2,
      criticalCount: 0,
      warningCount: 2,
      driftTotalMinor: 5_000_000n,
    });

    expect(notifyStaff).toHaveBeenCalledOnce();
    const input = getFirstCallInput();
    expect(input.severity).toBe('warning');
    expect(input.eventType).toBe('reconciliation.drift.warning');
  });
});

describe('reconciliation-alerter — zero drifts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls notifyStaff with severity=info + role=admin when no drifts above warning', async () => {
    await alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
      snapshotId: SNAP_ID,
      driftCount: 0,
      criticalCount: 0,
      warningCount: 0,
      driftTotalMinor: 0n,
    });

    expect(notifyStaff).toHaveBeenCalledOnce();
    const input = getFirstCallInput();
    expect(input.severity).toBe('info');
    expect(input.role).toBe('admin');
    expect(input.eventType).toBe('reconciliation.drift.none');
  });

  it('uses snapshotId as dedupeKey for all alert types', async () => {
    await alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
      snapshotId: SNAP_ID,
      driftCount: 0,
      criticalCount: 0,
      warningCount: 0,
      driftTotalMinor: 0n,
    });

    const input = getFirstCallInput();
    expect(input.dedupeKey).toBe(SNAP_ID);
  });
});

describe('reconciliation-alerter — error resilience', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not throw when notifyStaff rejects', async () => {
    vi.mocked(notifyStaff).mockRejectedValueOnce(new Error('DB down'));

    await expect(
      alertOnSnapshotComplete(mockDb, mockIo, mockEmailQ, mockSlackQ, {
        snapshotId: SNAP_ID,
        driftCount: 1,
        criticalCount: 1,
        warningCount: 0,
        driftTotalMinor: 100_000n,
      })
    ).resolves.toBeUndefined();
  });
});
