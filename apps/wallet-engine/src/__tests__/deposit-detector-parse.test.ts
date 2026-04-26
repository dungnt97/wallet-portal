import { id as ethersId } from 'ethers';
import type { Log } from 'ethers';
// Unit tests for BNB ERC-20 Transfer log parser — fixture logs, no real RPC
import { describe, expect, it } from 'vitest';
import { parseBnbTransferLog } from '../watcher/deposit-detector.js';

const TRANSFER_TOPIC = ethersId('Transfer(address,address,uint256)');
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';

// Build a minimal Log fixture matching ethers.js shape
function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    blockNumber: 12345,
    blockHash: '0xblock',
    transactionIndex: 0,
    removed: false,
    address: USDT,
    data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000', // 1e18
    topics: [
      TRANSFER_TOPIC,
      '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ],
    transactionHash: '0xtxhash',
    index: 0,
    ...overrides,
  } as unknown as Log;
}

describe('parseBnbTransferLog', () => {
  it('parses a USDT transfer log correctly', () => {
    const log = makeLog();
    const result = parseBnbTransferLog(log, USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.token).toBe('USDT');
    expect(result?.from).toBe(`0x${'a'.repeat(40)}`);
    expect(result?.to).toBe(`0x${'b'.repeat(40)}`);
    expect(result?.amount).toBe(BigInt('1000000000000000000')); // 1e18
    expect(result?.txHash).toBe('0xtxhash');
    expect(result?.blockNumber).toBe(12345);
  });

  it('parses a USDC transfer log correctly', () => {
    const log = makeLog({ address: USDC });
    const result = parseBnbTransferLog(log, USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.token).toBe('USDC');
  });

  it('returns null for non-Transfer topic', () => {
    const log = makeLog({ topics: ['0xdeadbeef', '0x1', '0x2'] });
    expect(parseBnbTransferLog(log, USDT, USDC)).toBeNull();
  });

  it('returns null for unrelated contract address', () => {
    const log = makeLog({ address: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000' });
    expect(parseBnbTransferLog(log, USDT, USDC)).toBeNull();
  });

  it('returns null when topics array is too short', () => {
    const log = makeLog({ topics: [TRANSFER_TOPIC] });
    expect(parseBnbTransferLog(log, USDT, USDC)).toBeNull();
  });

  it('is case-insensitive on contract address comparison', () => {
    const log = makeLog({ address: USDT.toLowerCase() });
    const result = parseBnbTransferLog(log, USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.token).toBe('USDT');
  });
});
