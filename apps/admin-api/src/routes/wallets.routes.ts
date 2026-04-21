// Wallets routes — GET /wallets — real query from wallets registry
import { Wallet } from '@wp/shared-types';
import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

const walletsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/wallets',
    {
      preHandler: requirePerm('wallets.read'),
      schema: {
        tags: ['wallets'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          tier: z.enum(['hot', 'cold']).optional(),
          purpose: z.enum(['deposit_hd', 'operational', 'cold_reserve']).optional(),
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
        }),
        response: {
          200: z.object({ data: z.array(Wallet), total: z.number().int(), page: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      const { chain, tier, purpose, page, limit } = req.query;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (chain) conditions.push(eq(schema.wallets.chain, chain));
      if (tier) conditions.push(eq(schema.wallets.tier, tier));
      if (purpose) conditions.push(eq(schema.wallets.purpose, purpose));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        app.db
          .select()
          .from(schema.wallets)
          .where(where)
          .orderBy(desc(schema.wallets.createdAt))
          .limit(limit)
          .offset(offset),
        app.db.select({ value: count() }).from(schema.wallets).where(where),
      ]);

      const total = Number(countRows[0]?.value ?? 0);
      const data = rows.map((w) => ({
        id: w.id,
        chain: w.chain,
        address: w.address,
        tier: w.tier,
        purpose: w.purpose,
        multisigAddr: w.multisigAddr ?? null,
        derivationPath: w.derivationPath ?? null,
        policyConfig: (w.policyConfig as Record<string, unknown> | null) ?? null,
        createdAt: w.createdAt.toISOString(),
      }));

      return reply.code(200).send({ data, total, page });
    }
  );
};

export default walletsRoutes;
