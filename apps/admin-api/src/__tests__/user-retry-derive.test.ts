// Unit tests for user-retry-derive service — idempotent HD address retry.
// Covers: already complete, missing chain triggers derivation, not-found, engine failure.
// Uses in-memory mocks — no real Postgres or wallet-engine required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DerivationFailedError,
  NotFoundError,
  retryDeriveUserAddresses,
} from '../services/user-retry-derive.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../services/audit.service.js', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/wallet-engine-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/wallet-engine-client.js')>();
  return { ...actual, deriveUserAddresses: vi.fn() };
});

import { deriveUserAddresses } from '../services/wallet-engine-client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-0001';
const STAFF_ID = 'staff-uuid-0001';
const WALLET_OPTS = { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' };

const DERIVED = [
  { chain: 'bnb' as const, address: '0xBNB', derivationPath: "m/44'/60'", derivationIndex: 0 },
  { chain: 'sol' as const, address: 'SolAddr', derivationPath: "m/44'/501'", derivationIndex: 0 },
];

const BNB_ADDR_ROW = {
  chain: 'bnb' as const,
  id: 'a1',
  userId: USER_ID,
  address: '0xBNB',
  derivationPath: null,
  derivationIndex: 0,
  tier: 'hot' as const,
  createdAt: new Date(),
};
const SOL_ADDR_ROW = {
  chain: 'sol' as const,
  id: 'a2',
  userId: USER_ID,
  address: 'SolAddr',
  derivationPath: null,
  derivationIndex: 0,
  tier: 'hot' as const,
  createdAt: new Date(),
};

// ── Mock builder ──────────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

function buildMockDb(opts: {
  userFound?: boolean; // true = return user row, false = return undefined (not found)
  existingChainRows?: unknown[]; // rows for first select (chain check)
  fullAddressRows?: unknown[]; // rows for second select (full rows when alreadyComplete)
}) {
  const existingChainRows = opts.existingChainRows ?? [];
  const fullAddressRows = opts.fullAddressRows ?? [BNB_ADDR_ROW, SOL_ADDR_ROW];
  // Default: user found. Explicitly pass userFound=false to simulate not found.
  const userResult = opts.userFound === false ? undefined : { id: USER_ID };

  let selectCount = 0;
  return {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue(userResult) },
    },
    select: vi.fn().mockImplementation(() => {
      selectCount++;
      const rows = selectCount === 1 ? existingChainRows : fullAddressRows;
      return buildSelectChain(rows);
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('retryDeriveUserAddresses service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deriveUserAddresses).mockResolvedValue({ addresses: DERIVED });
  });

  it('calls wallet-engine and returns addresses when derivation missing', async () => {
    const db = buildMockDb({ userFound: true, existingChainRows: [{ chain: 'bnb' }] }); // sol missing
    const result = await retryDeriveUserAddresses(
      db as unknown as Parameters<typeof retryDeriveUserAddresses>[0],
      WALLET_OPTS,
      USER_ID,
      STAFF_ID
    );
    expect(result.alreadyComplete).toBe(false);
    expect(result.addresses).toHaveLength(2);
    expect(deriveUserAddresses).toHaveBeenCalledWith(WALLET_OPTS, USER_ID);
  });

  it('returns alreadyComplete=true when both chains present — skips wallet-engine', async () => {
    const db = buildMockDb({
      userFound: true,
      existingChainRows: [{ chain: 'bnb' }, { chain: 'sol' }],
    });
    const result = await retryDeriveUserAddresses(
      db as unknown as Parameters<typeof retryDeriveUserAddresses>[0],
      WALLET_OPTS,
      USER_ID,
      STAFF_ID
    );
    expect(result.alreadyComplete).toBe(true);
    expect(deriveUserAddresses).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when user does not exist', async () => {
    const db = buildMockDb({ userFound: false });
    await expect(
      retryDeriveUserAddresses(
        db as unknown as Parameters<typeof retryDeriveUserAddresses>[0],
        WALLET_OPTS,
        USER_ID,
        STAFF_ID
      )
    ).rejects.toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('throws DerivationFailedError when wallet-engine call fails', async () => {
    vi.mocked(deriveUserAddresses).mockRejectedValue(new Error('engine offline'));
    const db = buildMockDb({ userFound: true, existingChainRows: [] });
    await expect(
      retryDeriveUserAddresses(
        db as unknown as Parameters<typeof retryDeriveUserAddresses>[0],
        WALLET_OPTS,
        USER_ID,
        STAFF_ID
      )
    ).rejects.toMatchObject({ name: 'DerivationFailedError', statusCode: 502 });
  });

  it('NotFoundError has correct shape', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('DerivationFailedError has correct shape', () => {
    const err = new DerivationFailedError('fail');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DERIVATION_FAILED');
  });
});
