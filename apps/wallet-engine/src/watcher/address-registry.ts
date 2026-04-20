// In-memory cache of watched HD addresses — refreshes from DB every 60s
import { userAddresses } from '@wp/admin-api/db-schema';
import pino from 'pino';
import type { Db } from '../db/client.js';

const logger = pino({ name: 'address-registry' });

const REFRESH_INTERVAL_MS = 60_000;

export interface AddressRegistry {
  /** Map of lowercase address → userId (for both chains) */
  bnb: Map<string, string>;
  sol: Map<string, string>;
}

export interface AddressRegistryHandle {
  registry: AddressRegistry;
  stop: () => void;
}

/** Load watched addresses from DB into in-memory maps */
async function loadAddresses(db: Db, registry: AddressRegistry): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: userAddresses.userId,
        chain: userAddresses.chain,
        address: userAddresses.address,
      })
      .from(userAddresses);

    registry.bnb.clear();
    registry.sol.clear();

    for (const row of rows) {
      if (row.chain === 'bnb') {
        registry.bnb.set(row.address.toLowerCase(), row.userId);
      } else if (row.chain === 'sol') {
        registry.sol.set(row.address, row.userId);
      }
    }

    logger.info(
      { bnbCount: registry.bnb.size, solCount: registry.sol.size },
      'Address registry refreshed',
    );
  } catch (err) {
    logger.error({ err }, 'Failed to refresh address registry');
  }
}

/**
 * Start the address registry — loads immediately, then refreshes every 60s.
 * Returns the live registry reference and a stop function.
 */
export async function startAddressRegistry(db: Db): Promise<AddressRegistryHandle> {
  const registry: AddressRegistry = { bnb: new Map(), sol: new Map() };

  await loadAddresses(db, registry);

  const intervalId = setInterval(() => {
    void loadAddresses(db, registry);
  }, REFRESH_INTERVAL_MS);

  return {
    registry,
    stop(): void {
      clearInterval(intervalId);
      logger.info('Address registry stopped');
    },
  };
}
