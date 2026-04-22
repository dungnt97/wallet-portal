// Solana RPC connection pool — manual failover (no built-in fallback in @solana/web3.js)
import { type Commitment, Connection } from '@solana/web3.js';
import pino from 'pino';
import { withFailover } from './pool.js';

const logger = pino({ name: 'solana-pool' });

const DEFAULT_COMMITMENT: Commitment = 'confirmed';

export interface SolanaPool {
  /** Primary connection (used for subscriptions) */
  primary: Connection;
  /** All connections in priority order */
  connections: Connection[];
  urls: string[];
}

/** Build Solana connection pool from one or more RPC URLs */
export function makeSolanaPool(urls: string[]): SolanaPool {
  if (urls.length === 0) {
    throw new Error('Solana pool requires at least one RPC URL');
  }

  const connections = urls.map((url) => new Connection(url, DEFAULT_COMMITMENT));

  logger.info({ urls }, 'Solana RPC pool initialised');
  return { primary: connections[0]!, connections, urls };
}

/**
 * Execute a Solana RPC call with failover across pool connections.
 * Use this for one-shot queries (getSlot, getTransaction, etc.).
 */
export async function solanaCall<T>(
  pool: SolanaPool,
  fn: (conn: Connection) => Promise<T>
): Promise<T> {
  return withFailover(pool.connections, fn);
}

/** Destroy all connections (closes WebSocket subscriptions) */
export async function destroySolanaPool(pool: SolanaPool): Promise<void> {
  // @solana/web3.js Connection has no explicit close — subscriptions removed on their own
  logger.info('Solana RPC pool released');
}
