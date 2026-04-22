// BNB RPC provider pool using ethers.js v6 FallbackProvider
import { FallbackProvider, JsonRpcProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'bnb-pool' });

export interface BnbPool {
  provider: FallbackProvider;
  urls: string[];
}

/**
 * Build a FallbackProvider from one or more RPC URLs.
 * First URL = highest priority (quorum weight 2), subsequent = weight 1.
 * BNB chain ID = 56 (mainnet) / 97 (testnet) — provider auto-detects.
 */
export function makeBnbPool(urls: string[]): BnbPool {
  if (urls.length === 0) {
    throw new Error('BNB pool requires at least one RPC URL');
  }

  const providers = urls.map(
    (url, i) => new JsonRpcProvider(url, undefined, { staticNetwork: true })
  );

  // FallbackProvider: quorum=1 means first-response wins; weight distributes priority
  const provider = new FallbackProvider(
    providers.map((p, i) => ({ provider: p, priority: i + 1, weight: i === 0 ? 2 : 1 })),
    undefined,
    { quorum: 1 }
  );

  logger.info({ urls }, 'BNB RPC pool initialised');
  return { provider, urls };
}

/** Destroy underlying providers (closes WebSocket connections if any) */
export async function destroyBnbPool(pool: BnbPool): Promise<void> {
  for (const p of pool.provider.providerConfigs) {
    (p.provider as JsonRpcProvider).destroy();
  }
  logger.info('BNB RPC pool destroyed');
}
