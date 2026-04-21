// Cold wallet routes — balance probe endpoint for hot+cold wallets across BNB+Solana.
// GET /cold/balances — returns 8 balance entries (4 wallets × 2 tokens), 30s Redis cache.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { type BalanceProbeConfig, getColdBalances } from '../services/cold-balance.service.js';

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
};

export default coldRoutes;
