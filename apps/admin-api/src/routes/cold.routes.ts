// Cold wallet routes — balance probe + wallet pair metadata for hot+cold wallets across BNB+Solana.
// GET /cold/balances — returns 8 balance entries (4 wallets × 2 tokens), 30s Redis cache.
// GET /cold/wallets  — returns hot+cold pairs with band thresholds from policyConfig.
// POST /cold/band-check/run — triggers fresh balance probe, returns latest state.
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { type BalanceProbeConfig, getColdBalances } from '../services/cold-balance.service.js';

// policyConfig JSONB shape stored on wallets (partial — only fields we read)
interface WalletPolicyConfig {
  bandFloorUsd?: number;
  bandCeilingUsd?: number;
  signerLabel?: string;
  geographicLabel?: string;
}

const coldRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Build probe config from env at request time (testability + hot-reload friendly)
  const getProbeConfig = (): BalanceProbeConfig => ({
    rpcBnb: process.env.RPC_BNB_PRIMARY ?? 'https://bsc-dataseed.binance.org',
    rpcSolana: process.env.RPC_SOLANA_PRIMARY ?? 'https://api.mainnet-beta.solana.com',
    usdtBnbAddr: process.env.USDT_BNB_ADDRESS ?? '0x55d398326f99059fF775485246999027B3197955',
    usdcBnbAddr: process.env.USDC_BNB_ADDRESS ?? '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdtSolMint: process.env.USDT_SOL_MINT ?? 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    usdcSolMint: process.env.USDC_SOL_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  });

  // ── GET /cold/balances ────────────────────────────────────────────────────────
  r.get(
    '/cold/balances',
    {
      preHandler: requirePerm('wallets.read'),
      schema: {
        tags: ['cold'],
        description:
          'Returns real-time (30s cached) USDT+USDC balances for hot+cold wallets across BNB and Solana.',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                chain: z.enum(['bnb', 'sol']),
                tier: z.enum(['hot', 'cold']),
                address: z.string(),
                token: z.enum(['USDT', 'USDC']),
                balance: z.string(),
                lastCheckedAt: z.string(),
                stale: z.boolean().optional(),
              })
            ),
          }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (_req, reply) => {
      const balances = await getColdBalances(app.db, app.redis, getProbeConfig());
      return reply.code(200).send({ data: balances });
    }
  );

  // ── GET /cold/wallets ────────────────────────────────────────────────────────
  // Returns hot+cold wallet pairs per chain, including band thresholds from policyConfig.
  r.get(
    '/cold/wallets',
    {
      preHandler: requirePerm('wallets.read'),
      schema: {
        tags: ['cold'],
        description: 'Returns hot+cold wallet pairs with band thresholds and vault metadata.',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                chain: z.enum(['bnb', 'sol']),
                tier: z.enum(['hot', 'cold']),
                address: z.string(),
                multisigAddr: z.string().nullable(),
                bandFloorUsd: z.number().nullable(),
                bandCeilingUsd: z.number().nullable(),
                signerLabel: z.string().nullable(),
                geographicLabel: z.string().nullable(),
              })
            ),
          }),
        },
      },
    },
    async (_req, reply) => {
      const rows = await app.db
        .select({
          chain: schema.wallets.chain,
          tier: schema.wallets.tier,
          address: schema.wallets.address,
          multisigAddr: schema.wallets.multisigAddr,
          policyConfig: schema.wallets.policyConfig,
        })
        .from(schema.wallets)
        .where(and(eq(schema.wallets.purpose, 'operational')))
        .then(async (hotRows) => {
          const coldRows = await app.db
            .select({
              chain: schema.wallets.chain,
              tier: schema.wallets.tier,
              address: schema.wallets.address,
              multisigAddr: schema.wallets.multisigAddr,
              policyConfig: schema.wallets.policyConfig,
            })
            .from(schema.wallets)
            .where(eq(schema.wallets.purpose, 'cold_reserve'));
          return [...hotRows, ...coldRows];
        });

      const data = rows.map((row) => {
        const cfg = (row.policyConfig ?? {}) as WalletPolicyConfig;
        return {
          chain: row.chain,
          tier: row.tier,
          address: row.address,
          multisigAddr: row.multisigAddr ?? null,
          bandFloorUsd: cfg.bandFloorUsd ?? null,
          bandCeilingUsd: cfg.bandCeilingUsd ?? null,
          signerLabel: cfg.signerLabel ?? null,
          geographicLabel: cfg.geographicLabel ?? null,
        };
      });

      return reply.code(200).send({ data });
    }
  );

  // ── POST /cold/band-check/run ─────────────────────────────────────────────────
  // Triggers a fresh balance probe (bypasses Redis cache by deleting keys), returns latest entries.
  r.post(
    '/cold/band-check/run',
    {
      preHandler: requirePerm('wallets.read'),
      schema: {
        tags: ['cold'],
        description: 'Triggers a manual band check — flushes balance cache and re-probes wallets.',
        response: {
          200: z.object({
            data: z.array(
              z.object({
                chain: z.enum(['bnb', 'sol']),
                tier: z.enum(['hot', 'cold']),
                address: z.string(),
                token: z.enum(['USDT', 'USDC']),
                balance: z.string(),
                lastCheckedAt: z.string(),
                stale: z.boolean().optional(),
              })
            ),
            triggeredAt: z.string(),
          }),
        },
      },
    },
    async (_req, reply) => {
      // Flush all balance cache keys so the next probe fetches fresh data
      const keys = await app.redis.keys('balance:*');
      if (keys.length > 0) {
        await app.redis.del(...keys);
      }
      const balances = await getColdBalances(app.db, app.redis, getProbeConfig());
      return reply.code(200).send({ data: balances, triggeredAt: new Date().toISOString() });
    }
  );
};

export default coldRoutes;
