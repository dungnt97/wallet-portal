// Ops gas wallets — GET /ops/gas-wallets
// Returns native BNB/SOL balances for operational (hot) wallets so ops can tell
// at a glance whether gas reserves are running low for sweeps and withdrawals.
// Uses raw fetch to keep admin-api free of viem/web3.js deps; balance probes
// run in parallel with a 2s timeout each.
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

const PROBE_TIMEOUT_MS = 2_000;

// Low-balance thresholds (native units) — below these, ops should top up.
// BNB tx ≈ 0.0001 BNB; 0.05 BNB covers ~500 sweep tx.
// SOL tx ≈ 0.000005 SOL; 0.5 SOL covers ~100k tx but we keep margin for rent.
const LOW_BALANCE_THRESHOLD: Record<'bnb' | 'sol', number> = {
  bnb: 0.05,
  sol: 0.5,
};

// EVM addresses must be 0x-prefixed hex (40 hex chars after 0x).
const BNB_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
// Solana base58 alphabet excludes 0/O/I/l; addresses are 32-44 chars.
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidChainAddress(chain: 'bnb' | 'sol', address: string): boolean {
  return chain === 'bnb' ? BNB_ADDR_RE.test(address) : SOL_ADDR_RE.test(address);
}

const GasWalletSchema = z.object({
  chain: z.enum(['bnb', 'sol']),
  address: z.string(),
  symbol: z.string(),
  /** Balance as a decimal string in native units (e.g. "0.1234"). */
  balance: z.string().nullable(),
  thresholdLow: z.number(),
  isLow: z.boolean(),
  status: z.enum(['ok', 'error']),
  error: z.string().optional(),
});

const ResponseSchema = z.object({
  wallets: z.array(GasWalletSchema),
});

async function fetchBnbBalance(rpc: string, address: string): Promise<bigint> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const data = (await res.json()) as { result?: string; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return BigInt(data.result ?? '0x0');
}

async function fetchSolBalance(rpc: string, address: string): Promise<bigint> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address, { commitment: 'confirmed' }],
    }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const data = (await res.json()) as {
    result?: { value: number };
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  return BigInt(data.result?.value ?? 0);
}

/** Format wei/lamports to human-readable native string with up to 6 decimals. */
function formatNative(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

const opsGasWalletsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/ops/gas-wallets',
    {
      preHandler: requireAuth(),
      schema: { tags: ['ops'], response: { 200: ResponseSchema } },
    },
    async (_req, reply) => {
      const bnbRpc = process.env.BNB_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com';
      const solRpc = process.env.SOL_RPC_URL ?? 'https://api.devnet.solana.com';

      const wallets = await app.db
        .select({
          chain: schema.wallets.chain,
          address: schema.wallets.address,
        })
        .from(schema.wallets)
        .where(eq(schema.wallets.purpose, 'operational'));

      const results = await Promise.all(
        wallets.map(async (w) => {
          const chain = w.chain as 'bnb' | 'sol';
          const symbol = chain === 'bnb' ? 'BNB' : 'SOL';
          const decimals = chain === 'bnb' ? 18 : 9;
          const thresholdLow = LOW_BALANCE_THRESHOLD[chain];
          if (!isValidChainAddress(chain, w.address)) {
            return {
              chain,
              address: w.address,
              symbol,
              balance: null,
              thresholdLow,
              isLow: false,
              status: 'error' as const,
              error: 'invalid address format (placeholder/seed?)',
            };
          }
          try {
            const raw =
              chain === 'bnb'
                ? await fetchBnbBalance(bnbRpc, w.address)
                : await fetchSolBalance(solRpc, w.address);
            const balanceStr = formatNative(raw, decimals);
            const balanceNum = Number(balanceStr);
            return {
              chain,
              address: w.address,
              symbol,
              balance: balanceStr,
              thresholdLow,
              isLow: Number.isFinite(balanceNum) && balanceNum < thresholdLow,
              status: 'ok' as const,
            };
          } catch (err) {
            return {
              chain,
              address: w.address,
              symbol,
              balance: null,
              thresholdLow,
              isLow: false,
              status: 'error' as const,
              error: String(err),
            };
          }
        })
      );

      return reply.code(200).send({ wallets: results });
    }
  );
};

export default opsGasWalletsRoutes;
