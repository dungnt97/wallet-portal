// Transactions routes — GET /transactions
// Unified on-chain ledger: queries the `transactions` table which stores canonical
// on-chain records written by deposit/withdrawal/sweep flows. Type is inferred from
// fromAddr/toAddr pattern (external→user = deposit, user→hot_safe = withdrawal, etc.)
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

/** Infer transaction type from address pattern stored by ledger.service */
function inferTxType(fromAddr: string, toAddr: string): 'deposit' | 'withdrawal' | 'sweep' {
  if (fromAddr === 'external' || fromAddr.startsWith('external.')) return 'deposit';
  if (toAddr === 'hot_safe' || toAddr.startsWith('hot_safe')) return 'sweep';
  return 'withdrawal';
}

const TxShape = z.object({
  id: z.string().uuid(),
  type: z.enum(['deposit', 'withdrawal', 'sweep']),
  chain: z.enum(['bnb', 'sol']),
  token: z.enum(['USDT', 'USDC']),
  amount: z.number(),
  from: z.string(),
  to: z.string(),
  txHash: z.string(),
  blockNumber: z.number(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  /** Fee not stored in transactions table — returned as 0 */
  fee: z.number(),
  timestamp: z.string(),
});

const transactionsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /transactions ─────────────────────────────────────────────────────
  r.get(
    '/transactions',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['transactions'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(25),
          chain: z.enum(['bnb', 'sol']).optional(),
          status: z.enum(['pending', 'confirmed', 'failed']).optional(),
          type: z.enum(['deposit', 'withdrawal', 'sweep']).optional(),
          /** Filter by token (asset) */
          token: z.enum(['USDT', 'USDC']).optional(),
          /** ISO datetime — only transactions on or after this date */
          dateFrom: z.string().datetime({ offset: true }).optional(),
          /** ISO datetime — only transactions on or before this date */
          dateTo: z.string().datetime({ offset: true }).optional(),
        }),
        response: {
          200: z.object({
            data: z.array(TxShape),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit, chain, status, token, dateFrom, dateTo } = req.query;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (chain) conditions.push(eq(schema.transactions.chain, chain));
      if (token) conditions.push(eq(schema.transactions.token, token));
      // tx_status enum: pending | confirmed | failed | dropped — map UI 'failed' to both
      if (status === 'confirmed') conditions.push(eq(schema.transactions.status, 'confirmed'));
      if (status === 'pending') conditions.push(eq(schema.transactions.status, 'pending'));
      if (status === 'failed') conditions.push(eq(schema.transactions.status, 'failed'));
      if (dateFrom) conditions.push(gte(schema.transactions.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(schema.transactions.createdAt, new Date(dateTo)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalRows] = await Promise.all([
        app.db
          .select()
          .from(schema.transactions)
          .where(where)
          .orderBy(desc(schema.transactions.createdAt))
          .limit(limit)
          .offset(offset),
        app.db
          .select({ count: count() })
          .from(schema.transactions)
          .where(where)
          .then((r) => r[0]?.count ?? 0),
      ]);

      // Client-side type filter (applied after fetch since type is derived, not stored)
      const { type: typeFilter } = req.query;
      let data = rows.map((tx) => ({
        id: tx.id,
        type: inferTxType(tx.fromAddr, tx.toAddr),
        chain: tx.chain,
        token: tx.token,
        amount: Number.parseFloat(tx.amount),
        from: tx.fromAddr,
        to: tx.toAddr,
        txHash: tx.hash,
        blockNumber: tx.blockNumber ? Number(tx.blockNumber) : 0,
        status: tx.status === 'dropped' ? ('failed' as const) : tx.status,
        fee: 0,
        timestamp: tx.createdAt.toISOString(),
      }));

      if (typeFilter) {
        data = data.filter((d) => d.type === typeFilter);
      }

      return reply.send({ data, total: Number(totalRows), page });
    }
  );
};

export default transactionsRoutes;
