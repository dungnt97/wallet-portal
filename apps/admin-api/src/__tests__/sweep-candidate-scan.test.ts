// Unit tests for sweep candidate scan service — happy path, empty candidates,
// threshold filtering, active sweep exclusion.
// Uses in-memory mocks — no real Postgres or RPC required.
import { describe, expect, it, vi } from 'vitest';
import {
  SWEEP_MIN_AMOUNT_USD,
  scanSweepCandidates,
} from '../services/sweep-candidate-scan.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-0001';
const ADDRESS_ID = 'addr-uuid-0001';
const ADDRESS = '0xUserAddr001';

const makeCreditedRow = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  chain: 'bnb',
  token: 'USDT',
  totalAmount: '500',
  ...overrides,
});

const makeUserAddress = (overrides: Record<string, unknown> = {}) => ({
  id: ADDRESS_ID,
  userId: USER_ID,
  chain: 'bnb',
  address: ADDRESS,
  derivationPath: "m/44'/60'/0'/0/1",
  ...overrides,
});

const makeSweepRow = (overrides: Record<string, unknown> = {}) => ({
  fromAddr: ADDRESS,
  chain: 'bnb',
  token: 'USDT',
  amount: '100',
  ...overrides,
});

// ── Mock helpers ──────────────────────────────────────────────────────────────

function buildMockDb(opts: {
  creditedRows?: ReturnType<typeof makeCreditedRow>[];
  activeSweeps?: ReturnType<typeof makeSweepRow>[];
  userAddresses?: ReturnType<typeof makeUserAddress>[];
}) {
  const creditedRows = opts.creditedRows ?? [];
  const activeSweeps = opts.activeSweeps ?? [];
  const userAddresses = opts.userAddresses ?? [];

  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: credited deposit aggregation
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(creditedRows),
            }),
          }),
        };
      }
      if (selectCallCount === 2) {
        // Second call: active sweeps
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(activeSweeps),
          }),
        };
      }
      // Third call: user_addresses
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(userAddresses),
        }),
      };
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scanSweepCandidates', () => {
  it('returns empty array when no credited deposits exist', async () => {
    const db = buildMockDb({ creditedRows: [] });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toEqual([]);
  });

  it('happy path — returns candidate with correct fields', async () => {
    const db = buildMockDb({
      creditedRows: [makeCreditedRow({ totalAmount: '500' })],
      activeSweeps: [],
      userAddresses: [makeUserAddress()],
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      userAddressId: ADDRESS_ID,
      userId: USER_ID,
      chain: 'bnb',
      address: ADDRESS,
      creditedUsdt: '500',
      estimatedUsd: 500,
    });
  });

  it('filters out candidates below minimum threshold', async () => {
    const belowThreshold = String(SWEEP_MIN_AMOUNT_USD - 1);
    const db = buildMockDb({
      creditedRows: [makeCreditedRow({ totalAmount: belowThreshold })],
      activeSweeps: [],
      userAddresses: [makeUserAddress()],
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toHaveLength(0);
  });

  it('deducts already-swept amount from candidate balance', async () => {
    // credited=500, swept=400 → net=100, which is >= SWEEP_MIN_AMOUNT_USD(100)
    const db = buildMockDb({
      creditedRows: [makeCreditedRow({ totalAmount: '500' })],
      activeSweeps: [makeSweepRow({ amount: '400' })],
      userAddresses: [makeUserAddress()],
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    // net = 100 = SWEEP_MIN_AMOUNT_USD → should be included
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.creditedUsdt).toBe('100');
  });

  it('excludes candidate when net balance is zero after sweep deduction', async () => {
    // credited=500, swept=500 → net=0, below threshold
    const db = buildMockDb({
      creditedRows: [makeCreditedRow({ totalAmount: '500' })],
      activeSweeps: [makeSweepRow({ amount: '500' })],
      userAddresses: [makeUserAddress()],
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toHaveLength(0);
  });

  it('skips user when no userAddress row exists for that chain', async () => {
    const db = buildMockDb({
      creditedRows: [makeCreditedRow()],
      activeSweeps: [],
      userAddresses: [], // no address registered
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toHaveLength(0);
  });

  it('aggregates USDT + USDC into estimatedUsd', async () => {
    const db = buildMockDb({
      creditedRows: [
        makeCreditedRow({ token: 'USDT', totalAmount: '200' }),
        makeCreditedRow({ token: 'USDC', totalAmount: '300' }),
      ],
      activeSweeps: [],
      userAddresses: [makeUserAddress()],
    });

    const candidates = await scanSweepCandidates(
      db as unknown as Parameters<typeof scanSweepCandidates>[0]
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.estimatedUsd).toBe(500);
    expect(candidates[0]?.creditedUsdt).toBe('200');
    expect(candidates[0]?.creditedUsdc).toBe('300');
  });
});
