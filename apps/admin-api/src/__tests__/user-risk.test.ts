// Unit tests for user-risk service — updateRiskTier happy path, validation errors,
// not-found, audit emission.
// Uses in-memory mocks — no real Postgres required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateRiskTier } from '../services/user-risk.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

import { emitAudit } from '../services/audit.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-0001';
const STAFF_ID = 'staff-uuid-0001';

const makeUpdatedRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  riskTier: 'medium',
  riskReason: 'Suspicious pattern detected',
  riskUpdatedAt: new Date(),
  riskUpdatedBy: STAFF_ID,
  ...overrides,
});

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildMockDb(opts: { updatedRow?: unknown; notFound?: boolean } = {}) {
  const rows = opts.notFound ? [] : [opts.updatedRow ?? makeUpdatedRow()];
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

const BASE_PARAMS = {
  userId: USER_ID,
  tier: 'medium' as const,
  reason: 'Suspicious pattern detected',
  staffId: STAFF_ID,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('updateRiskTier service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path — updates risk tier and returns result', async () => {
    const db = buildMockDb();

    const result = await updateRiskTier(
      db as unknown as Parameters<typeof updateRiskTier>[0],
      BASE_PARAMS
    );

    expect(result).toMatchObject({
      userId: USER_ID,
      riskTier: 'medium',
      riskReason: 'Suspicious pattern detected',
    });
    expect(result.riskUpdatedAt).toBeDefined();
  });

  it('emits audit entry after successful update', async () => {
    const db = buildMockDb();
    await updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], BASE_PARAMS);
    expect(emitAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'user.risk_tier.updated', resourceId: USER_ID })
    );
  });

  it('throws Error when user not found (UPDATE returns no rows)', async () => {
    const db = buildMockDb({ notFound: true });
    await expect(
      updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], BASE_PARAMS)
    ).rejects.toThrow(USER_ID);
  });

  it('throws on invalid tier value', async () => {
    const db = buildMockDb();
    await expect(
      updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], {
        ...BASE_PARAMS,
        tier: 'unknown' as never,
      })
    ).rejects.toThrow('Invalid risk tier');
  });

  it('throws when reason is too short (< 5 chars)', async () => {
    const db = buildMockDb();
    await expect(
      updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], {
        ...BASE_PARAMS,
        reason: 'hi',
      })
    ).rejects.toThrow('reason');
  });

  it('accepts frozen tier — blocks all withdrawals via policy', async () => {
    const db = buildMockDb({ updatedRow: makeUpdatedRow({ riskTier: 'frozen' }) });
    const result = await updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], {
      ...BASE_PARAMS,
      tier: 'frozen',
      reason: 'Fraud suspected',
    });
    expect(result.riskTier).toBe('frozen');
  });

  it('accepts all valid tiers without throwing', async () => {
    const tiers = ['low', 'medium', 'high', 'frozen'] as const;
    for (const tier of tiers) {
      const db = buildMockDb({ updatedRow: makeUpdatedRow({ riskTier: tier }) });
      const result = await updateRiskTier(db as unknown as Parameters<typeof updateRiskTier>[0], {
        ...BASE_PARAMS,
        tier,
        reason: 'Valid reason here',
      });
      expect(result.riskTier).toBe(tier);
    }
  });
});
