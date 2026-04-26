// Tests for all 3 internal route plugins using Fastify app.inject().
// No real DB / RPC — all I/O boundaries mocked.
// Routes tested: internal-derive, internal-multisig-sync, internal-recovery.
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared test token ─────────────────────────────────────────────────────────
const BEARER = 'test-bearer-token-abcd1234567890';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDeriveUserAddresses = vi.fn();
const mockGetMultisigSyncStatus = vi.fn();
const mockBumpEvmTx = vi.fn();
const mockBumpSolanaTx = vi.fn();
const mockCancelEvmTx = vi.fn();

vi.mock('../services/hd-derive-user.js', () => ({
  deriveUserAddresses: mockDeriveUserAddresses,
}));

vi.mock('../services/multisig-sync-probe.js', () => ({
  getMultisigSyncStatus: mockGetMultisigSyncStatus,
}));

vi.mock('../services/recovery-bump-evm.js', () => ({
  bumpEvmTx: mockBumpEvmTx,
}));

vi.mock('../services/recovery-bump-solana.js', () => ({
  bumpSolanaTx: mockBumpSolanaTx,
}));

vi.mock('../services/recovery-cancel-evm.js', () => ({
  cancelEvmTx: mockCancelEvmTx,
}));

vi.mock('@wp/admin-api/db-schema', () => ({
  users: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _col, val })),
}));

// ── DB fixture factory ────────────────────────────────────────────────────────

function makeDb(userRow: unknown) {
  return {
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(userRow),
      },
    },
  };
}

// ── Fastify app builders ──────────────────────────────────────────────────────

async function buildDeriveApp(
  opts: { userRow?: unknown; hdMnemonicBnb?: string; hdSeedSolana?: string } = {}
) {
  const {
    userRow = { id: 'user-1', email: 'test@test.com' },
    hdMnemonicBnb = 'word '.repeat(12).trim(),
    hdSeedSolana = 'deadbeef'.repeat(8),
  } = opts;
  const app = Fastify({ logger: false });
  const { default: internalDerivePlugin } = await import('../routes/internal-derive.js');
  await app.register(internalDerivePlugin, {
    db: makeDb(userRow) as never,
    bearerToken: BEARER,
    hdMnemonicBnb,
    hdSeedSolana,
  });
  await app.ready();
  return app;
}

async function buildMultisigApp(overrides: Record<string, unknown> = {}) {
  const app = Fastify({ logger: false });
  const { default: internalMultisigSyncPlugin } = await import(
    '../routes/internal-multisig-sync.js'
  );
  await app.register(internalMultisigSyncPlugin, {
    bearerToken: BEARER,
    redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn() } as never,
    bnbProvider: {} as never,
    solanaConnection: {} as never,
    safeAddress: '0xSafe',
    squadsPda: 'SquadsPda1111111111111111111111111111111111',
    ...overrides,
  });
  await app.ready();
  return app;
}

async function buildRecoveryApp() {
  const app = Fastify({ logger: false });
  const { default: internalRecoveryPlugin } = await import('../routes/internal-recovery.js');
  await app.register(internalRecoveryPlugin, {
    bearerToken: BEARER,
    bnbProvider: {} as never,
    solanaConnection: {} as never,
  });
  await app.ready();
  return app;
}

// ── Tests: internal-derive ────────────────────────────────────────────────────

describe('internal-derive — /internal/users/:userId/derive-addresses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('401 MISSING_BEARER when no Authorization header', async () => {
    const app = await buildDeriveApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string };
    expect(body.code).toBe('MISSING_BEARER');
    await app.close();
  });

  it('401 INVALID_BEARER when wrong token', async () => {
    const app = await buildDeriveApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string };
    expect(body.code).toBe('INVALID_BEARER');
    await app.close();
  });

  it('404 NOT_FOUND when user does not exist', async () => {
    const app = await buildDeriveApp({ userRow: null });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('200 returns derived addresses on success', async () => {
    const mockAddresses = [
      {
        chain: 'bnb',
        address: '0xBnbAddr',
        derivationPath: "m/44'/60'/0'/0/0",
        derivationIndex: 0,
      },
      {
        chain: 'sol',
        address: 'SolAddr111',
        derivationPath: "m/44'/501'/0'/0/0",
        derivationIndex: 0,
      },
    ];
    mockDeriveUserAddresses.mockResolvedValue({ addresses: mockAddresses });

    const app = await buildDeriveApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { addresses: typeof mockAddresses };
    expect(body.addresses).toHaveLength(2);
    expect(body.addresses[0]?.chain).toBe('bnb');
    await app.close();
  });

  it('500 DERIVE_FAILED when deriveUserAddresses throws', async () => {
    mockDeriveUserAddresses.mockRejectedValue(new Error('HD key failure'));
    const app = await buildDeriveApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { code: string; message: string };
    expect(body.code).toBe('DERIVE_FAILED');
    expect(body.message).toContain('HD key failure');
    await app.close();
  });

  it('route is disabled when hdMnemonicBnb is empty', async () => {
    const app = await buildDeriveApp({ hdMnemonicBnb: '', hdSeedSolana: 'deadbeef'.repeat(8) });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    // Route not registered — Fastify returns 404
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('route is disabled when hdSeedSolana is empty', async () => {
    const app = await buildDeriveApp({
      hdMnemonicBnb: 'word '.repeat(12).trim(),
      hdSeedSolana: '',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('500 with non-Error thrown returns string message', async () => {
    mockDeriveUserAddresses.mockRejectedValue('string-error');
    const app = await buildDeriveApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/users/00000000-0000-0000-0000-000000000001/derive-addresses',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { message: string };
    expect(body.message).toBe('string-error');
    await app.close();
  });
});

// ── Tests: internal-multisig-sync ─────────────────────────────────────────────

describe('internal-multisig-sync — auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('401 MISSING_BEARER on GET /internal/multisig/sync-status without auth', async () => {
    const app = await buildMultisigApp();
    const res = await app.inject({ method: 'GET', url: '/internal/multisig/sync-status' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe('MISSING_BEARER');
    await app.close();
  });

  it('401 INVALID_BEARER on GET /internal/multisig/sync-status with wrong token', async () => {
    const app = await buildMultisigApp();
    const res = await app.inject({
      method: 'GET',
      url: '/internal/multisig/sync-status',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe('INVALID_BEARER');
    await app.close();
  });

  it('401 MISSING_BEARER on POST /internal/multisig/sync-refresh without auth', async () => {
    const app = await buildMultisigApp();
    const res = await app.inject({ method: 'POST', url: '/internal/multisig/sync-refresh' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('internal-multisig-sync — sync-status GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('200 returns sync status result', async () => {
    const mockResult = {
      bnb: { status: 'synced', lastSyncAt: new Date().toISOString(), nonce: 5 },
      sol: { status: 'synced', lastSyncAt: new Date().toISOString() },
    };
    mockGetMultisigSyncStatus.mockResolvedValue(mockResult);

    const app = await buildMultisigApp();
    const res = await app.inject({
      method: 'GET',
      url: '/internal/multisig/sync-status',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as typeof mockResult;
    expect(body.bnb.status).toBe('synced');
    expect(body.sol.status).toBe('synced');
    await app.close();
  });

  it('500 PROBE_FAILED when getMultisigSyncStatus throws', async () => {
    mockGetMultisigSyncStatus.mockRejectedValue(new Error('RPC down'));

    const app = await buildMultisigApp();
    const res = await app.inject({
      method: 'GET',
      url: '/internal/multisig/sync-status',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code: string }).code).toBe('PROBE_FAILED');
    await app.close();
  });

  it('getMultisigSyncStatus called with bustCache=false for GET', async () => {
    mockGetMultisigSyncStatus.mockResolvedValue({
      bnb: { status: 'synced', lastSyncAt: new Date().toISOString() },
      sol: { status: 'synced', lastSyncAt: new Date().toISOString() },
    });

    const app = await buildMultisigApp();
    await app.inject({
      method: 'GET',
      url: '/internal/multisig/sync-status',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(mockGetMultisigSyncStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false
    );
    await app.close();
  });
});

describe('internal-multisig-sync — sync-refresh POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('200 returns refreshed sync status', async () => {
    const mockResult = {
      bnb: { status: 'synced', lastSyncAt: new Date().toISOString() },
      sol: { status: 'stale', lastSyncAt: new Date().toISOString() },
    };
    mockGetMultisigSyncStatus.mockResolvedValue(mockResult);

    const app = await buildMultisigApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/multisig/sync-refresh',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('getMultisigSyncStatus called with bustCache=true for POST', async () => {
    mockGetMultisigSyncStatus.mockResolvedValue({
      bnb: { status: 'synced', lastSyncAt: new Date().toISOString() },
      sol: { status: 'synced', lastSyncAt: new Date().toISOString() },
    });

    const app = await buildMultisigApp();
    await app.inject({
      method: 'POST',
      url: '/internal/multisig/sync-refresh',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(mockGetMultisigSyncStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      true
    );
    await app.close();
  });

  it('500 PROBE_FAILED when sync-refresh throws', async () => {
    mockGetMultisigSyncStatus.mockRejectedValue(new Error('Redis error'));

    const app = await buildMultisigApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/multisig/sync-refresh',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('warns when safeAddress is missing but still registers routes', async () => {
    mockGetMultisigSyncStatus.mockResolvedValue({
      bnb: { status: 'error', lastSyncAt: new Date().toISOString() },
      sol: { status: 'error', lastSyncAt: new Date().toISOString() },
    });

    const app = await buildMultisigApp({ safeAddress: '' });
    const res = await app.inject({
      method: 'GET',
      url: '/internal/multisig/sync-status',
      headers: { authorization: `Bearer ${BEARER}` },
    });
    // Route still works, just uses zero-address fallback
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ── Tests: internal-recovery ──────────────────────────────────────────────────

describe('internal-recovery — auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('401 MISSING_BEARER on /internal/recovery/bump', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({ method: 'POST', url: '/internal/recovery/bump', body: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('401 INVALID_BEARER on /internal/recovery/cancel', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: 'Bearer badtoken' },
      body: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('internal-recovery — /internal/recovery/bump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('400 INVALID_BODY with missing required fields', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ entityType: 'withdrawal' }), // missing chain, originalTxHash, etc
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('400 MISSING_NONCE for BNB bump without nonce', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xabc',
        feeMultiplier: 1.2,
        hdIndex: 0,
        // nonce intentionally missing
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('MISSING_NONCE');
    await app.close();
  });

  it('200 for BNB bump success', async () => {
    mockBumpEvmTx.mockResolvedValue({
      txHash: '0xnewHash',
      newMaxFeePerGas: BigInt(1_000_000_000),
      newMaxPriorityFeePerGas: BigInt(500_000_000),
    });

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { txHash: string; newMaxFeePerGasWei: string };
    expect(body.txHash).toBe('0xnewHash');
    expect(body.newMaxFeePerGasWei).toBe('1000000000');
    await app.close();
  });

  it('400 MISSING_TX_BASE64 for SOL bump without originalTxBase64', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'sweep',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'sol',
        originalTxHash: 'solTxHash111',
        feeMultiplier: 1.3,
        hdIndex: 1,
        // originalTxBase64 intentionally missing
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('MISSING_TX_BASE64');
    await app.close();
  });

  it('200 for SOL bump success', async () => {
    mockBumpSolanaTx.mockResolvedValue({
      txSignature: 'newSolSig1111',
      newCuPriceMicroLamports: 5000,
    });

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'sweep',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'sol',
        originalTxHash: 'solTxHash111',
        originalTxBase64: 'base64txdata==',
        feeMultiplier: 1.3,
        hdIndex: 1,
        currentCuPriceMicroLamports: 1000,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { txHash: string; newCuPriceMicroLamports: number };
    expect(body.txHash).toBe('newSolSig1111');
    await app.close();
  });

  it('503 GAS_ORACLE_UNAVAILABLE when bump returns that error', async () => {
    mockBumpEvmTx.mockRejectedValue(new Error('GAS_ORACLE_UNAVAILABLE'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
      }),
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('422 BUMP_FEE_CAP_EXCEEDED when bump returns that error', async () => {
    mockBumpEvmTx.mockRejectedValue(new Error('BUMP_FEE_CAP_EXCEEDED: max fee exceeded'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
      }),
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('500 BUMP_FAILED for generic error', async () => {
    mockBumpEvmTx.mockRejectedValue(new Error('unexpected failure'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
      }),
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code: string }).code).toBe('BUMP_FAILED');
    await app.close();
  });

  it('503 SOLANA_BLOCKHASH_UNAVAILABLE maps to 503', async () => {
    mockBumpSolanaTx.mockRejectedValue(new Error('SOLANA_BLOCKHASH_UNAVAILABLE'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/bump',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'sweep',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'sol',
        originalTxHash: 'solTx1',
        originalTxBase64: 'base64data==',
        feeMultiplier: 1.2,
        hdIndex: 0,
      }),
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('internal-recovery — /internal/recovery/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('400 INVALID_BODY with missing fields', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ chain: 'bnb' }),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('410 cancel_not_supported_on_solana for SOL chain', async () => {
    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'sol',
        originalTxHash: 'solTx1',
        nonce: 3,
        feeMultiplier: 1.2,
        hdIndex: 0,
        chainId: '1',
        hotSafeAddress: '0xSafe',
      }),
    });
    expect(res.statusCode).toBe(410);
    expect((res.json() as { code: string }).code).toBe('cancel_not_supported_on_solana');
    await app.close();
  });

  it('200 for BNB cancel success', async () => {
    mockCancelEvmTx.mockResolvedValue({
      txHash: '0xcancelHash',
      newMaxFeePerGas: BigInt(2_000_000_000),
    });

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
        chainId: '56',
        hotSafeAddress: '0xHotSafe',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { txHash: string; newMaxFeePerGasWei: string };
    expect(body.txHash).toBe('0xcancelHash');
    await app.close();
  });

  it('503 GAS_ORACLE_UNAVAILABLE for cancel', async () => {
    mockCancelEvmTx.mockRejectedValue(new Error('GAS_ORACLE_UNAVAILABLE'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
        chainId: '56',
        hotSafeAddress: '0xHotSafe',
      }),
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('422 CANCEL_FEE_CAP_EXCEEDED for cancel', async () => {
    mockCancelEvmTx.mockRejectedValue(new Error('CANCEL_FEE_CAP_EXCEEDED: too high'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
        chainId: '56',
        hotSafeAddress: '0xHotSafe',
      }),
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('500 CANCEL_FAILED for generic error', async () => {
    mockCancelEvmTx.mockRejectedValue(new Error('unknown'));

    const app = await buildRecoveryApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/recovery/cancel',
      headers: { authorization: `Bearer ${BEARER}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        entityType: 'withdrawal',
        entityId: '00000000-0000-0000-0000-000000000001',
        chain: 'bnb',
        originalTxHash: '0xorigHash',
        nonce: 5,
        feeMultiplier: 1.2,
        hdIndex: 0,
        chainId: '56',
        hotSafeAddress: '0xHotSafe',
      }),
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code: string }).code).toBe('CANCEL_FAILED');
    await app.close();
  });
});
