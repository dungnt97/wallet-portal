import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
// Deposits routes — GET /deposits, GET /deposits/:id, GET /deposits/export.csv
// POST /deposits/manual-credit — admin + WebAuthn step-up override
// POST /deposits/:id/add-to-sweep — triggers a sweep for the deposit's user address
// Internal credit endpoint lives in internal.routes.ts (bearer auth, D4)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { requireStepUp } from '../auth/require-step-up.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  countDepositsForExport,
  queryDepositsForExport,
  streamDepositCsv,
} from '../services/deposit-csv.service.js';
import {
  NotFoundError as ManualNotFoundError,
  ValidationError as ManualValidationError,
  manualCredit,
} from '../services/deposit-manual-credit.service.js';

const CSV_ROW_CAP = 50_000;

// Wire-compatible shape for UI consumption
const DepositShape = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** User email — joined from users table */
  userEmail: z.string().nullable(),
  chain: z.enum(['bnb', 'sol']),
  token: z.enum(['USDT', 'USDC']),
  amount: z.string(),
  status: z.enum(['pending', 'credited', 'swept', 'failed', 'reorg_pending']),
  confirmedBlocks: z.number().int(),
  txHash: z.string().nullable(),
  /** User's on-chain deposit address — joined from user_addresses */
  userAddress: z.string().nullable(),
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
          /** Minimum amount filter (inclusive) — decimal string */
          minAmount: z.coerce.number().positive().optional(),
          /** Maximum amount filter (inclusive) — decimal string */
          maxAmount: z.coerce.number().positive().optional(),
          /** ISO date string — only deposits on or after this date */
          dateFrom: z.string().datetime({ offset: true }).optional(),
          /** ISO date string — only deposits on or before this date */
          dateTo: z.string().datetime({ offset: true }).optional(),
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
      const { page, limit, status, chain, token, minAmount, maxAmount, dateFrom, dateTo } =
        req.query;
      const offset = (page - 1) * limit;

      // Build filter conditions
      const conditions = [];
      if (status) conditions.push(eq(schema.deposits.status, status));
      if (chain) conditions.push(eq(schema.deposits.chain, chain));
      if (token) conditions.push(eq(schema.deposits.token, token));
      if (minAmount !== undefined)
        conditions.push(gte(sql`CAST(${schema.deposits.amount} AS NUMERIC)`, minAmount));
      if (maxAmount !== undefined)
        conditions.push(lte(sql`CAST(${schema.deposits.amount} AS NUMERIC)`, maxAmount));
      if (dateFrom) conditions.push(gte(schema.deposits.createdAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(schema.deposits.createdAt, new Date(dateTo)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        app.db
          .select({
            id: schema.deposits.id,
            userId: schema.deposits.userId,
            userEmail: schema.users.email,
            userAddress: schema.userAddresses.address,
            chain: schema.deposits.chain,
            token: schema.deposits.token,
            amount: schema.deposits.amount,
            status: schema.deposits.status,
            confirmedBlocks: schema.deposits.confirmedBlocks,
            txHash: schema.deposits.txHash,
            createdAt: schema.deposits.createdAt,
            updatedAt: schema.deposits.updatedAt,
          })
          .from(schema.deposits)
          .leftJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
          .leftJoin(
            schema.userAddresses,
            and(
              eq(schema.userAddresses.userId, schema.deposits.userId),
              eq(schema.userAddresses.chain, schema.deposits.chain)
            )
          )
          .where(where)
          .orderBy(desc(schema.deposits.createdAt))
          .limit(limit)
          .offset(offset),
        app.db.select({ value: count() }).from(schema.deposits).where(where),
      ]);
      const total = Number(countRows[0]?.value ?? 0);

      const data = rows.map((r) => ({
        ...r,
        amount: String(r.amount),
        userEmail: r.userEmail ?? null,
        userAddress: r.userAddress ?? null,
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

  // POST /deposits/manual-credit — admin override credit (admin role + WebAuthn step-up)
  // Must be registered BEFORE /deposits/:id to avoid the /:id route swallowing the segment
  r.post(
    '/deposits/manual-credit',
    {
      preHandler: [requirePerm('deposits.manage'), requireStepUp()],
      schema: {
        tags: ['deposits'],
        body: z.object({
          userId: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']),
          token: z.enum(['USDT', 'USDC']),
          amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string'),
          reason: z.string().min(20).max(1000),
        }),
        response: {
          201: z.object({
            depositId: z.string().uuid(),
            userId: z.string().uuid(),
            chain: z.enum(['bnb', 'sol']),
            token: z.enum(['USDT', 'USDC']),
            amount: z.string(),
            creditedBy: z.string().uuid(),
            createdAt: z.string(),
          }),
          400: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requirePerm ensures session.staff exists
      const staffId = req.session.staff!.id;
      try {
        const result = await manualCredit(app.db, app.io, app.emailQueue, app.slackQueue, {
          userId: req.body.userId,
          chain: req.body.chain,
          token: req.body.token,
          amount: req.body.amount,
          reason: req.body.reason,
          staffId,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof ManualValidationError) {
          return reply.code(400).send({ code: err.code, message: err.message });
        }
        if (err instanceof ManualNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // POST /deposits/:id/add-to-sweep — create a sweep trigger for the deposit's user address
  // Must be registered BEFORE /deposits/:id to avoid route conflict (Fastify matches first)
  r.post(
    '/deposits/:id/add-to-sweep',
    {
      preHandler: requirePerm('sweeps.trigger'),
      schema: {
        tags: ['deposits'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          201: z.object({ sweepId: z.string().uuid(), userAddressId: z.string().uuid() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;

      // Fetch deposit with its userId
      const deposit = await app.db.query.deposits.findFirst({
        where: eq(schema.deposits.id, req.params.id),
      });
      if (!deposit) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `Deposit ${req.params.id} not found` });
      }
      if (deposit.status !== 'credited') {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `Deposit must be in 'credited' status to add to sweep (current: ${deposit.status})`,
        });
      }

      // Look up the user's chain address (required for sweep FK)
      const userAddress = await app.db.query.userAddresses.findFirst({
        where: and(
          eq(schema.userAddresses.userId, deposit.userId),
          eq(schema.userAddresses.chain, deposit.chain)
        ),
      });
      if (!userAddress) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: `No user address found for userId=${deposit.userId} chain=${deposit.chain}`,
        });
      }

      // Resolve hot-safe destination from wallets registry
      const hotSafeWallet = await app.db.query.wallets.findFirst({
        where: and(
          eq(schema.wallets.chain, deposit.chain),
          eq(schema.wallets.purpose, 'operational')
        ),
      });
      const toMultisig =
        hotSafeWallet?.address ??
        (deposit.chain === 'bnb'
          ? (process.env.SAFE_ADDRESS ?? '0x0000000000000000000000000000000000000001')
          : (process.env.SQUADS_MULTISIG_ADDRESS ?? '11111111111111111111111111111111'));

      // Check no pending sweep already exists for this address+token combo
      const existing = await app.db.query.sweeps.findFirst({
        where: and(
          eq(schema.sweeps.userAddressId, userAddress.id),
          eq(schema.sweeps.token, deposit.token),
          eq(schema.sweeps.status, 'pending')
        ),
      });
      if (existing) {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `A pending sweep already exists for this address+token (sweepId=${existing.id})`,
        });
      }

      const [sweep] = await app.db
        .insert(schema.sweeps)
        .values({
          userAddressId: userAddress.id,
          chain: deposit.chain,
          token: deposit.token,
          fromAddr: userAddress.address,
          toMultisig,
          amount: deposit.amount,
          status: 'pending',
          createdBy: staffId || null,
        })
        .returning();

      if (!sweep) throw new Error('INSERT sweep returned no row');

      const { emitAudit } = await import('../services/audit.service.js');
      await emitAudit(app.db, {
        staffId,
        action: 'deposit.add_to_sweep',
        resourceType: 'deposit',
        resourceId: deposit.id,
        changes: { sweepId: sweep.id, userAddressId: userAddress.id },
      });

      app.io.of('/stream').emit('sweep.created', { sweepId: sweep.id, depositId: deposit.id });
      return reply.code(201).send({ sweepId: sweep.id, userAddressId: userAddress.id });
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
        userEmail: null,
        userAddress: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  );
};

export default depositsRoutes;
