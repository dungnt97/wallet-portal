// Unit tests for checkBnbConfirmations (deposit-confirm-worker).
// Verifies receipt-based confirmation depth logic and provider cleanup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/env.js';
import { checkBnbConfirmations } from '../queue/workers/deposit-confirm-worker.js';

const cfg = {
  RPC_SOLANA_PRIMARY: 'https://fake-solana-rpc',
  RPC_BNB_PRIMARY: 'https://fake-bnb-rpc',
} as unknown as AppConfig;

const TX_HASH_BNB = '0xdeadbeef000000000000000000000000000000000000000000000000deadbeef';

// ── Mock ethers (vi.mock is hoisted before imports) ───────────────────────────

const mockGetTransactionReceipt = vi.fn();
const mockGetBlockNumber = vi.fn();
const mockProviderDestroy = vi.fn();

vi.mock('ethers', () => ({
  JsonRpcProvider: vi.fn(() => ({
    getTransactionReceipt: mockGetTransactionReceipt,
    getBlockNumber: mockGetBlockNumber,
    destroy: mockProviderDestroy,
  })),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkBnbConfirmations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns confirmed=true when confirmations >= 12 (CONFIRM_DEPTH_BNB)', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ blockNumber: 100 });
    mockGetBlockNumber.mockResolvedValue(115); // 115 - 100 = 15 >= 12

    const result = await checkBnbConfirmations(TX_HASH_BNB, cfg);

    expect(result.confirmed).toBe(true);
    expect(result.confirmations).toBe(15);
    // Provider must always be destroyed after use to avoid resource leaks
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('returns confirmed=false when confirmations < 12', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ blockNumber: 100 });
    mockGetBlockNumber.mockResolvedValue(105); // 105 - 100 = 5 < 12

    const result = await checkBnbConfirmations(TX_HASH_BNB, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(5);
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('returns confirmed=false when receipt is null (tx not mined yet)', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);
    mockGetBlockNumber.mockResolvedValue(200);

    const result = await checkBnbConfirmations(TX_HASH_BNB, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(0);
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('returns confirmed=false when receipt.blockNumber is null', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ blockNumber: null });
    mockGetBlockNumber.mockResolvedValue(200);

    const result = await checkBnbConfirmations(TX_HASH_BNB, cfg);

    expect(result.confirmed).toBe(false);
    expect(result.confirmations).toBe(0);
    expect(mockProviderDestroy).toHaveBeenCalled();
  });

  it('destroys provider even when receipt lookup throws', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('RPC error'));
    mockGetBlockNumber.mockResolvedValue(200);

    await expect(checkBnbConfirmations(TX_HASH_BNB, cfg)).rejects.toThrow('RPC error');
    expect(mockProviderDestroy).toHaveBeenCalled();
  });
});
