import { and, count, desc, eq } from 'drizzle-orm';
// Deposits routes — GET /deposits, GET /deposits/:id, GET /deposits/export.csv
// Internal credit endpoint lives in internal.routes.ts (bearer auth, D4)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  countDepositsForExport,
  queryDepositsForExport,
  streamDepositCsv,
} from '../services/deposit-csv.service.js';

const CSV_ROW_CAP = 50_000;

// Wire-compatible shape for UI consumption
const DepositShape = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chain: z.enum(['bnb', 'sol']),
  token: z.enum(['USDT', 'USDC']),
  amount: z.string(),
  status: z.enum(['pending', 'credited', 'swept', 'failed', 'reorg_pending']),
  confirmedBlocks: z.number().int(),
  txHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const depositsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // GET /deposits — paginated + filtered list
  r.get(
    '/deposits',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['deposits'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['pending', 'credited', 'swept', 'failed', 'reorg_pending']).optional(),
          chain: z.enum(['bnb', 'sol']).optional(),
          token: z.enum(['USDT', 'USDC']).optional(),
        }),
        response: {
          200: z.object({
            data: z.array(DepositShape),
            total: z.number().int(),
            page: z.number().int(),
            limit: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit, status, chain, token } = req.query;
      const offset = (page - 1) * limit;

      // Build filter conditions
      const conditions = [];
      if (status) conditions.push(eq(schema.deposits.status, status));
      if (chain) conditions.push(eq(schema.deposits.chain, chain));
      if (token) conditions.push(eq(schema.deposits.token, token));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        app.db.query.deposits.findMany({
          where,
          orderBy: [desc(schema.deposits.createdAt)],
          limit,
          offset,
        }),
        app.db.select({ value: count() }).from(schema.deposits).where(where),
      ]);
      const total = Number(countRows[0]?.value ?? 0);

      const data = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));

      return reply.code(200).send({ data, total, page, limit });
    }
  );

  // GET /deposits/export.csv — streaming CSV with filters + 50k cap
  // Must be registered BEFORE /deposits/:id to avoid route conflict
  r.get(
    '/deposits/export.csv',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['deposits'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          userId: z.string().uuid().optional(),
          status: z.enum(['pending', 'credited', 'swept', 'failed', 'reorg_pending']).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
      },
    },
    async (req, reply) => {
      const { chain, userId, status, from, to } = req.query;
      const filterParams = {
        ...(chain !== undefined && { chain }),
        ...(userId !== undefined && { userId }),
        ...(status !== undefined && { status }),
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
      };

      const rowCount = await countDepositsForExport(app.db, filterParams);
      if (rowCount > CSV_ROW_CAP) {
        return reply
          .code(429)
          .header('Retry-After', '0')
          .header('Content-Type', 'application/json')
          .send({ error: 'too_many_rows', max: CSV_ROW_CAP, found: rowCount });
      }

      const fromLabel = from ? from.slice(0, 10) : 'all';
      const toLabel = to ? to.slice(0, 10) : 'now';
      const filename = `deposits-${fromLabel}-to-${toLabel}.csv`;

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Transfer-Encoding', 'chunked');

      const rows = await queryDepositsForExport(app.db, filterParams);
      streamDepositCsv(rows, (chunk) => {
        reply.raw.write(chunk);
      });
      reply.raw.end();
    }
  );

  // GET /deposits/:id — single deposit by ID
  r.get(
    '/deposits/:id',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['deposits'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: DepositShape,
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const row = await app.db.query.deposits.findFirst({
        where: eq(schema.deposits.id, req.params.id),
      });

      if (!row) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `Deposit ${req.params.id} not found` });
      }

      return reply.code(200).send({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  );
};

export default depositsRoutes;
