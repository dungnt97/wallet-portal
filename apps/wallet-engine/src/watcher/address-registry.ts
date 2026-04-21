// In-memory cache of watched HD addresses — refreshes from DB every 60s
// Queries user_addresses table; normalises BNB to lowercase hex, Solana as-is.
import { userAddresses } from '@wp/admin-api/db-schema';
import pino from 'pino';
import type { Db } from '../db/client.js';

const logger = pino({ name: 'address-registry' });

export const REFRESH_INTERVAL_MS = 60_000;

export interface RegistryEntry {
  userAddressId: string;
  chain: 'bnb' | 'sol';
  /** lowercase hex for BNB, base58 for Solana */
  address: string;
  derivationPath: string | null;
  userId: string;
}

/** Lookup key: `<chain>:<address>` */
function makeKey(chain: 'bnb' | 'sol', address: string): string {
  return `${chain}:${address}`;
}

/** Normalise address per chain convention */
function normalise(chain: 'bnb' | 'sol', address: string): string {
  return chain === 'bnb' ? address.toLowerCase() : address;
}

export class AddressRegistry {
  private byAddress = new Map<string, RegistryEntry>();
  private refreshIntervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Load addresses from DB; clears existing cache first */
  async refresh(db: Db): Promise<void> {
    try {
      const rows = await db
        .select({
          id: userAddresses.id,
          userId: userAddresses.userId,
          chain: userAddresses.chain,
          address: userAddresses.address,
          derivationPath: userAddresses.derivationPath,
        })
        .from(userAddresses);

      this.byAddress.clear();

      for (const row of rows) {
        const chain = row.chain as 'bnb' | 'sol';
        const addr = normalise(chain, row.address);
        const entry: RegistryEntry = {
          userAddressId: row.id,
          chain,
          address: addr,
          derivationPath: row.derivationPath ?? null,
          userId: row.userId,
        };
        this.byAddress.set(makeKey(chain, addr), entry);
      }

      logger.info({ count: this.byAddress.size }, 'Address registry refreshed');
    } catch (err) {
      logger.error({ err }, 'Failed to refresh address registry');
    }
  }

  /** Lookup by chain + address (normalisation applied internally) */
  lookup(chain: 'bnb' | 'sol', address: string): RegistryEntry | null {
    return this.byAddress.get(makeKey(chain, normalise(chain, address))) ?? null;
  }

  /** Start periodic auto-refresh; also performs an immediate refresh */
  startAutoRefresh(db: Db, intervalMs = REFRESH_INTERVAL_MS): void {
    if (this.refreshIntervalHandle !== null) {
      logger.warn('startAutoRefresh called while already running — ignoring');
      return;
    }
    this.refreshIntervalHandle = setInterval(() => {
      void this.refresh(db);
    }, intervalMs);
  }

  stop(): void {
    if (this.refreshIntervalHandle !== null) {
      clearInterval(this.refreshIntervalHandle);
      this.refreshIntervalHandle = null;
    }
    logger.info('Address registry stopped');
  }

  size(): number {
    return this.byAddress.size;
  }

  /**
   * Convenience: maps for bnb/sol used by deposit-detector legacy API.
   * Returns Maps from normalised address → userId.
   */
  toChainMaps(): { bnb: Map<string, string>; sol: Map<string, string> } {
    const bnb = new Map<string, string>();
    const sol = new Map<string, string>();
    for (const entry of this.byAddress.values()) {
      if (entry.chain === 'bnb') bnb.set(entry.address, entry.userId);
      else sol.set(entry.address, entry.userId);
    }
    return { bnb, sol };
  }
}

// ── Legacy functional API — kept for backward compat with server.ts ───────────

/** @deprecated Use AddressRegistry class directly */
export interface AddressRegistryLegacy {
  bnb: Map<string, string>;
  sol: Map<string, string>;
}

/** @deprecated Use AddressRegistry class directly */
export interface AddressRegistryHandle {
  registry: AddressRegistryLegacy;
  stop: () => void;
}

/**
 * Start the address registry — loads immediately, then refreshes every 60s.
 * @deprecated Prefer `new AddressRegistry()` for new code.
 */
export async function startAddressRegistry(db: Db): Promise<AddressRegistryHandle> {
  const reg = new AddressRegistry();
  await reg.refresh(db);
  reg.startAutoRefresh(db);

  const maps = reg.toChainMaps();
  // Live-updating proxy — maps are rebuilt on each refresh tick
  const registry: AddressRegistryLegacy = maps;

  // Patch refresh to keep the maps live
  const originalRefresh = reg.refresh.bind(reg);
  reg.refresh = async (d: Db) => {
    await originalRefresh(d);
    const updated = reg.toChainMaps();
    registry.bnb = updated.bnb;
    registry.sol = updated.sol;
  };

  return {
    registry,
    stop(): void {
      reg.stop();
    },
  };
}
