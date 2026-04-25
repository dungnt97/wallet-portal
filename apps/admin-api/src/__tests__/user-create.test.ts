// Unit tests for user-create service — happy path, duplicate email (ConflictError),
// derivation failure (DerivationFailedError), audit side effects.
// Uses in-memory mocks — no real Postgres or wallet-engine required.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  DerivationFailedError,
  createUser,
} from '../services/user-create.service.js';

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

const STAFF_ID = 'staff-uuid-0001';
const USER_ID = 'user-uuid-0001';

const VALID_INPUT = {
  email: 'newuser@example.com',
  kycTier: 'basic' as const,
  staffId: STAFF_ID,
  ipAddr: '127.0.0.1',
};

const DERIVED_ADDRESSES = [
  {
    chain: 'bnb' as const,
    address: '0xABC',
    derivationPath: "m/44'/60'/0'/0/0",
    derivationIndex: 0,
  },
  {
    chain: 'sol' as const,
    address: 'SolAddr1',
    derivationPath: "m/44'/501'/0'/0'",
    derivationIndex: 0,
  },
];

const makeUserRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: VALID_INPUT.email,
  kycTier: 'basic',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Mock builder helpers ──────────────────────────────────────────────────────

function makeInsertMock(returnRows: unknown[], opts: { pgCode?: string } = {}) {
  const returning = vi.fn().mockImplementation(() => {
    if (opts.pgCode) {
      const err = new Error('unique violation') as Error & { code?: string };
      err.code = opts.pgCode;
      return Promise.reject(err);
    }
    return Promise.resolve(returnRows);
  });
  const onConflictDoUpdate = vi.fn().mockResolvedValue(returnRows);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoUpdate });
  return vi.fn().mockReturnValue({ values });
}

function buildMockDb(opts: { insertError?: string; userRow?: unknown } = {}) {
  return {
    insert: makeInsertMock(
      [opts.userRow ?? makeUserRow()],
      opts.insertError ? { pgCode: opts.insertError } : {}
    ),
  };
}

const WALLET_ENGINE_OPTS = { baseUrl: 'http://localhost:3003', bearerToken: 'test-token' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createUser service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deriveUserAddresses).mockResolvedValue({ addresses: DERIVED_ADDRESSES });
  });

  it('happy path — inserts user, derives addresses, returns result', async () => {
    const db = buildMockDb();
    const result = await createUser(
      db as unknown as Parameters<typeof createUser>[0],
      WALLET_ENGINE_OPTS,
      VALID_INPUT
    );

    expect(result.user).toMatchObject({ id: USER_ID, email: VALID_INPUT.email });
    expect(result.addresses).toHaveLength(2);
    expect(result.derivationPartial).toBe(false);
    expect(deriveUserAddresses).toHaveBeenCalledWith(WALLET_ENGINE_OPTS, USER_ID);
  });

  it('normalises email to lowercase+trim before insert', async () => {
    const db = buildMockDb();
    await createUser(db as unknown as Parameters<typeof createUser>[0], WALLET_ENGINE_OPTS, {
      ...VALID_INPUT,
      email: '  UPPER@Example.COM  ',
    });
    const insertValues = vi.mocked(db.insert).mock.results[0]?.value?.values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'upper@example.com' })
    );
  });

  it('throws ConflictError on Postgres unique violation (code 23505)', async () => {
    const db = buildMockDb({ insertError: '23505' });
    await expect(
      createUser(db as unknown as Parameters<typeof createUser>[0], WALLET_ENGINE_OPTS, VALID_INPUT)
    ).rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 });
  });

  it('re-throws unknown DB errors as-is', async () => {
    const db = {
      insert: vi
        .fn()
        .mockReturnValue({
          values: vi
            .fn()
            .mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error('DB down')) }),
        }),
    };
    await expect(
      createUser(db as unknown as Parameters<typeof createUser>[0], WALLET_ENGINE_OPTS, VALID_INPUT)
    ).rejects.toThrow('DB down');
  });

  it('throws DerivationFailedError when wallet-engine fails', async () => {
    vi.mocked(deriveUserAddresses).mockRejectedValue(new Error('engine unavailable'));
    const db = buildMockDb();
    await expect(
      createUser(db as unknown as Parameters<typeof createUser>[0], WALLET_ENGINE_OPTS, VALID_INPUT)
    ).rejects.toMatchObject({ name: 'DerivationFailedError', statusCode: 502, userId: USER_ID });
  });

  it('ConflictError has correct shape', () => {
    const err = new ConflictError('dup');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err instanceof Error).toBe(true);
  });

  it('DerivationFailedError has correct shape', () => {
    const err = new DerivationFailedError('fail', 'u-1');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('DERIVATION_FAILED');
    expect(err.userId).toBe('u-1');
  });
});
