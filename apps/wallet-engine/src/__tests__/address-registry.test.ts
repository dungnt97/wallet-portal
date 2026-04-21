// Unit tests for AddressRegistry — mocked DB, no real network
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client.js';
import { AddressRegistry } from '../watcher/address-registry.js';

/** Build a minimal fake DB that returns the supplied rows */
function makeDbAsync(
  rows: Array<{
    id: string;
    userId: string;
    chain: string;
    address: string;
    derivationPath: string | null;
  }>
): Db {
  const fromResult = Promise.resolve(rows);
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(fromResult),
    }),
  } as unknown as Db;
}

const BNB_ROW = {
  id: 'addr-id-1',
  userId: 'user-1',
  chain: 'bnb',
  address: '0xAaBbCcDdEeFf0011223344556677889900112233',
  derivationPath: "m/44'/60'/0'/0/0",
};

const SOL_ROW = {
  id: 'addr-id-2',
  userId: 'user-2',
  chain: 'sol',
  address: 'SolAddr1111111111111111111111111111111111111',
  derivationPath: "m/44'/501'/0'/0'",
};

describe('AddressRegistry', () => {
  let registry: AddressRegistry;

  beforeEach(() => {
    registry = new AddressRegistry();
  });

  it('starts empty before first refresh', () => {
    expect(registry.size()).toBe(0);
    expect(registry.lookup('bnb', '0xaabbccdd')).toBeNull();
  });

  it('loads BNB and Solana rows on refresh', async () => {
    const db = makeDbAsync([BNB_ROW, SOL_ROW]);
    await registry.refresh(db);

    expect(registry.size()).toBe(2);
  });

  it('normalises BNB address to lowercase for lookup', async () => {
    const db = makeDbAsync([BNB_ROW]);
    await registry.refresh(db);

    const mixed = '0xAaBbCcDdEeFf0011223344556677889900112233';
    const entry = registry.lookup('bnb', mixed);
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe('user-1');
    expect(entry?.address).toBe(mixed.toLowerCase());
  });

  it('preserves Solana address casing for lookup', async () => {
    const db = makeDbAsync([SOL_ROW]);
    await registry.refresh(db);

    const entry = registry.lookup('sol', SOL_ROW.address);
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe('user-2');
    expect(entry?.chain).toBe('sol');
  });

  it('returns null for address on wrong chain', async () => {
    const db = makeDbAsync([BNB_ROW]);
    await registry.refresh(db);

    expect(registry.lookup('sol', BNB_ROW.address)).toBeNull();
  });

  it('returns null for completely unknown address', async () => {
    const db = makeDbAsync([BNB_ROW]);
    await registry.refresh(db);

    expect(registry.lookup('bnb', '0x0000000000000000000000000000000000000000')).toBeNull();
  });

  it('clears stale entries on subsequent refresh', async () => {
    const db1 = makeDbAsync([BNB_ROW]);
    await registry.refresh(db1);
    expect(registry.size()).toBe(1);

    // Second refresh returns only SOL row — BNB should be gone
    const db2 = makeDbAsync([SOL_ROW]);
    await registry.refresh(db2);
    expect(registry.size()).toBe(1);
    expect(registry.lookup('bnb', BNB_ROW.address)).toBeNull();
    expect(registry.lookup('sol', SOL_ROW.address)).not.toBeNull();
  });

  it('toChainMaps returns correct bnb/sol split', async () => {
    const db = makeDbAsync([BNB_ROW, SOL_ROW]);
    await registry.refresh(db);

    const { bnb, sol } = registry.toChainMaps();
    expect(bnb.size).toBe(1);
    expect(sol.size).toBe(1);
    expect(bnb.get(BNB_ROW.address.toLowerCase())).toBe('user-1');
    expect(sol.get(SOL_ROW.address)).toBe('user-2');
  });

  it('does not throw if DB query fails', async () => {
    const badDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('DB offline')),
      }),
    } as unknown as Db;

    // Should log error and keep previous state intact
    await expect(registry.refresh(badDb)).resolves.not.toThrow();
    expect(registry.size()).toBe(0);
  });

  it('stop() clears the auto-refresh interval without throwing', async () => {
    const db = makeDbAsync([BNB_ROW]);
    await registry.refresh(db);
    registry.startAutoRefresh(db, 100_000);
    expect(() => registry.stop()).not.toThrow();
  });
});
