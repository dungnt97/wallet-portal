import { Connection } from '@solana/web3.js';
import { JsonRpcProvider } from 'ethers';
// Chain routes — gas price history + realtime single probe
//
//   GET /chain/gas-history?chain=bnb|sol&range=24h
//     → { points: [{t, price}], current, avg, min, max }
//     Reads Redis sorted set gas:bnb or gas:sol.
//     If no samples yet (wallet-engine cold start): returns current=null, points=[].
//
//   GET /chain/gas-current?chain=bnb|sol
//     → { chain, price, unit, ts }
//     Direct uncached RPC call (realtime, no Redis).
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import type { Config } from '../config/env.js';

/** Parse raw JSON stored in Redis sorted set member. Returns null on malformed data. */
function parseMember(raw: string): { ts: string; price: number } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).ts === 'string' &&
      typeof (parsed as Record<string, unknown>).price === 'number'
    ) {
      return parsed as { ts: string; price: number };
    }
    return null;
  } catch {
    return null;
  }
}

/** Probe BNB gas via getFeeData().gasPrice → gwei (2 dp). Throws on RPC error. */
async function liveGwei(url: string): Promise<number> {
  const rpc = new JsonRpcProvider(url, undefined, { staticNetwork: true });
  const feeData = await rpc.getFeeData();
  const weiPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (weiPrice === null) throw new Error('BNB getFeeData returned no gas price');
  return Number((weiPrice * 100n) / 1_000_000_000n) / 100;
}

/** Probe Solana median priority fee → SOL/sig. Throws on RPC error. */
async function liveSolPerSig(url: string): Promise<number> {
  const conn = new Connection(url, 'confirmed');
  const fees = await conn.getRecentPrioritizationFees();
  if (fees.length === 0) return 0;
  const sorted = [...fees].sort((a, b) => a.prioritizationFee - b.prioritizationFee);
  const mid = Math.floor(sorted.length / 2);
  const midFee = sorted[mid]?.prioritizationFee ?? 0;
  const midPrevFee = sorted[mid - 1]?.prioritizationFee ?? 0;
  const median = sorted.length % 2 === 1 ? midFee : (midPrevFee + midFee) / 2;
  return median / 1_000_000_000_000;
}

const GAS_KEY: Record<'bnb' | 'sol', string> = {
  bnb: 'gas:bnb',
  sol: 'gas:sol',
};

const UNIT: Record<'bnb' | 'sol', string> = {
  bnb: 'gwei',
  sol: 'SOL/sig',
};

const HistoryResponseSchema = z.object({
  points: z.array(z.object({ t: z.string(), price: z.number() })),
  current: z.number().nullable(),
  avg: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const CurrentResponseSchema = z.object({
  chain: z.enum(['bnb', 'sol']),
  price: z.number().nullable(),
  unit: z.string(),
  ts: z.string(),
});

const chainRoutes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /chain/gas-history ────────────────────────────────────────────────
  r.get(
    '/chain/gas-history',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['chain'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']),
          range: z.literal('24h').default('24h'),
        }),
        response: { 200: HistoryResponseSchema },
      },
    },
    async (req, reply) => {
      const { chain } = req.query;
      const key = GAS_KEY[chain];
      const since = Date.now() - 24 * 60 * 60 * 1_000;

      // ZRANGEBYSCORE returns members in ascending score (time) order
      const members = await app.redis.zrangebyscore(key, since, '+inf');

      const points = members
        .map((m) => {
          const parsed = parseMember(m);
          return parsed ? { t: parsed.ts, price: parsed.price } : null;
        })
        .filter((p): p is { t: string; price: number } => p !== null);

      if (points.length === 0) {
        return reply.code(200).send({ points: [], current: null, avg: null, min: null, max: null });
      }

      const prices = points.map((p) => p.price);
      // points is non-empty (guarded above), last element is always defined
      const current = prices[prices.length - 1] ?? 0;
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);

      return reply.code(200).send({ points, current, avg, min, max });
    }
  );

  // ── GET /chain/gas-current ────────────────────────────────────────────────
  r.get(
    '/chain/gas-current',
    {
      preHandler: requirePerm('sweeps.read'),
      schema: {
        tags: ['chain'],
        querystring: z.object({ chain: z.enum(['bnb', 'sol']) }),
        response: { 200: CurrentResponseSchema },
      },
    },
    async (req, reply) => {
      const { chain } = req.query;
      const ts = new Date().toISOString();
      let price: number | null = null;

      try {
        if (chain === 'bnb') {
          price = await liveGwei(opts.cfg.RPC_BNB_PRIMARY);
        } else {
          price = await liveSolPerSig(opts.cfg.RPC_SOLANA_PRIMARY);
        }
      } catch (err) {
        app.log.warn({ err, chain }, 'Live gas probe failed');
      }

      return reply.code(200).send({ chain, price, unit: UNIT[chain], ts });
    }
  );
};

export default chainRoutes;
