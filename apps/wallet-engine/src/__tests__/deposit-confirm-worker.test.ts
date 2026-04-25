// Bug 2 regression: checkSolanaConfirmations — finalized/null status handling.
// Tests that FAIL if the fix is reverted:
//   1. finalized + null confirmations → confirmed=true (not 0)
//   2. purged status (null info) → fallback to getTransaction
//   3. searchTransactionHistory: true is passed
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';
import { checkSolanaConfirmations } from '../queue/workers/deposit-confirm-worker.js';

const cfg = {
  RPC_SOLANA_PRIMARY: 'https://fake-solana-rpc',
  RPC_BNB_PRIMARY: 'https://fake-bnb-rpc',
} as unknown as AppConfig;

const TX_HASH_SOL = 'solTxHash1111111111111111111111111111111111111111111111111111111111';

// ── Mock @solana/web3.js (vi.mock is hoisted before imports) ──────────────────

const mockGetSignatureStatuses = vi.fn();
const mockGetTransaction = vi.fn();
const mockSolanaConnection = {
  getSignatureStatuses: mockGetSignatureStatuses,
  getTransaction: mockGetTransaction,
};

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => mockSolanaConnection),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSolStatus(opts: {
  info: null | {
    err?: unknown;
    confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
    confirmations?: number | null;
  };
}) {
  return { value: [opts.info] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkSolanaConfirmations — Bug 2 regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns confirmed=true when confirmationStatus is "finalized" even with null confirmations', async () => {
    // Bug 2: old code treated null confirmations as 0, so finalized would read as 0 confs
    mockGetSignatureStatuses.mockResolvedValue(
      makeSolStatus({
        info: { confirmationStatus: 'finalized', confirmations: null, err: null },
      })
    );

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(true);
    // Worker reports CONFIRM_DEPTH_SOLANA (32) for finalized
    expect(result.confirmations).toBe(32);
    // Should NOT call getTransaction — finalized path returns early
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it('returns confirmed=false when info.err is set', async () => {
    mockGetSignatureStatuses.mockResolvedValue(
      makeSolStatus({
        info: { confirmationStatus: 'confirmed', confirmations: 40, err: { InstructionError: [] } },
      })
    );

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(0);
  });

  it('returns confirmed=true when confirmations >= 32 (not finalized)', async () => {
    mockGetSignatureStatuses.mockResolvedValue(
      makeSolStatus({
        info: { confirmationStatus: 'confirmed', confirmations: 35, err: null },
      })
    );

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(true);
    expect(result.confirmations).toBe(35);
  });

  it('returns confirmed=false when confirmations < 32', async () => {
    mockGetSignatureStatuses.mockResolvedValue(
      makeSolStatus({
        info: { confirmationStatus: 'confirmed', confirmations: 10, err: null },
      })
    );

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(10);
  });

  it('falls back to getTransaction when info is null and tx exists — returns confirmed=true', async () => {
    // Bug 2: status purged from recent history → info is null → old code treated as 0 confs
    // Fix: call getTransaction to check if tx really exists on-chain
    mockGetSignatureStatuses.mockResolvedValue(makeSolStatus({ info: null }));
    mockGetTransaction.mockResolvedValue({ meta: { err: null } });

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(true);
    expect(result.confirmations).toBe(32);
    expect(mockGetTransaction).toHaveBeenCalledWith(TX_HASH_SOL, {
      maxSupportedTransactionVersion: 0,
    });
  });

  it('falls back to getTransaction when info is null and tx not found — returns confirmed=false', async () => {
    mockGetSignatureStatuses.mockResolvedValue(makeSolStatus({ info: null }));
    mockGetTransaction.mockResolvedValue(null);

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(0);
  });

  it('falls back to getTransaction when info is null and tx has meta.err — returns confirmed=false', async () => {
    mockGetSignatureStatuses.mockResolvedValue(makeSolStatus({ info: null }));
    mockGetTransaction.mockResolvedValue({ meta: { err: { SomeError: [] } } });

    const result = await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(0);
  });

  it('passes searchTransactionHistory: true to getSignatureStatuses', async () => {
    // Bug 2: old code did not pass this flag, causing early null return for older txs
    mockGetSignatureStatuses.mockResolvedValue(
      makeSolStatus({ info: { confirmationStatus: 'finalized', confirmations: null, err: null } })
    );

    await checkSolanaConfirmations(TX_HASH_SOL, cfg);

    expect(mockGetSignatureStatuses).toHaveBeenCalledWith([TX_HASH_SOL], {
      searchTransactionHistory: true,
    });
  });
});
