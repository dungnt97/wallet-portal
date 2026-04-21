import type { Log } from 'ethers';
// Unit tests for BNB ERC-20 Transfer log parser — golden fixture, no real RPC
import { describe, expect, it } from 'vitest';
import { TRANSFER_TOPIC, parseErc20TransferLog } from '../watcher/bnb-log-parser.js';

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';

/** Build a minimal ethers Log fixture */
function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    blockNumber: 12345,
    blockHash: '0xblockhash',
    transactionIndex: 0,
    removed: false,
    address: USDT,
    // 1e18 in hex (32 bytes)
    data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    topics: [
      TRANSFER_TOPIC,
      '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ],
    transactionHash: '0xtxhash123',
    index: 2,
    ...overrides,
  } as unknown as Log;
}

describe('parseErc20TransferLog', () => {
  it('parses a USDT Transfer log correctly', () => {
    const result = parseErc20TransferLog(makeLog(), USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.token).toBe('USDT');
    expect(result?.from).toBe(`0x${'a'.repeat(40)}`);
    expect(result?.to).toBe(`0x${'b'.repeat(40)}`);
    expect(result?.amount).toBe(BigInt('1000000000000000000'));
    expect(result?.txHash).toBe('0xtxhash123');
    expect(result?.blockNumber).toBe(12345);
    expect(result?.logIndex).toBe(2);
  });

  it('parses a USDC Transfer log', () => {
    const result = parseErc20TransferLog(makeLog({ address: USDC }), USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.token).toBe('USDC');
    expect(result?.contractAddress).toBe(USDC.toLowerCase());
  });

  it('returns null for wrong topic0', () => {
    const log = makeLog({ topics: ['0xdeadbeef', '0x1', '0x2'] });
    expect(parseErc20TransferLog(log, USDT, USDC)).toBeNull();
  });

  it('returns null for unrelated contract address', () => {
    const log = makeLog({ address: '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000' });
    expect(parseErc20TransferLog(log, USDT, USDC)).toBeNull();
  });

  it('returns null when topics array is too short', () => {
    const log = makeLog({ topics: [TRANSFER_TOPIC, '0x01'] });
    expect(parseErc20TransferLog(log, USDT, USDC)).toBeNull();
  });

  it('is case-insensitive on contract address comparison', () => {
    const log = makeLog({ address: USDT.toLowerCase() });
    expect(parseErc20TransferLog(log, USDT, USDC)?.token).toBe('USDT');
  });

  it('normalises from/to to lowercase', () => {
    const result = parseErc20TransferLog(makeLog(), USDT, USDC);
    expect(result?.from).toBe(result?.from.toLowerCase());
    expect(result?.to).toBe(result?.to.toLowerCase());
  });

  it('handles zero-amount transfer', () => {
    const log = makeLog({ data: `0x${'0'.repeat(64)}` });
    const result = parseErc20TransferLog(log, USDT, USDC);
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(0n);
  });
});
