// Rebalance routes — POST /rebalance initiates a hot→cold transfer (operation_type='hot_to_cold').
// GET /rebalance/history — paginated list of past rebalance withdrawals (sourceTier='cold').
// Destination auto-resolved from wallets registry; policy whitelist fast-path applies.
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  KillSwitchEnabledError,
  NotFoundError,
  PolicyRejectedError,
  ValidationError,
  createRebalance,
} from '../services/rebalance-create.service.js';

const rebalanceRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const getPolicyOpts = () => ({
    baseUrl: process.env.POLICY_ENGINE_URL ?? 'http://localhost:3003',
    bearerToken: process.env.SVC_BEARER_TOKEN ?? '',
    timeoutMs: 2_000,
  });

  // ── GET /rebalance/history ────────────────────────────────────────────────────
  // Returns past rebalance ops (withdrawals with sourceTier = 'cold') for the cold page.
  r.get(
    '/rebalance/history',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['rebalance'],
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(50).default(20),
        }),
        response: {
          200: z.object({
            data: z.array(
              z.object({
                id: z.string().uuid(),
                chain: z.enum(['bnb', 'sol']),
                direction: z.enum(['hot→cold', 'cold→hot']),
                amount: z.number(),
                createdAt: z.string(),
                executedAt: z.string().nullable(),
                sigs: z.number().int(),
                status: z.enum(['awaiting_signatures', 'completed', 'failed']),
                txHash: z.string().nullable(),
                proposer: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (req, reply) => {
      const { limit } = req.query;

      // Rebalance withdrawals are those with operationType hot_to_cold or cold_to_hot
      const rows = await app.db
        .select({
          id: schema.withdrawals.id,
          chain: schema.withdrawals.chain,
          sourceTier: schema.withdrawals.sourceTier,
          amount: schema.withdrawals.amount,
          createdAt: schema.withdrawals.createdAt,
          broadcastAt: schema.withdrawals.broadcastAt,
          status: schema.withdrawals.status,
          txHash: schema.withdrawals.txHash,
          createdBy: schema.withdrawals.createdBy,
          multisigOpId: schema.withdrawals.multisigOpId,
          collectedSigs: schema.multisigOperations.collectedSigs,
          operationType: schema.multisigOperations.operationType,
        })
        .from(schema.withdrawals)
        .leftJoin(
          schema.multisigOperations,
          eq(schema.withdrawals.multisigOpId, schema.multisigOperations.id)
        )
        .where(eq(schema.multisigOperations.operationType, 'hot_to_cold'))
        .orderBy(desc(schema.withdrawals.createdAt))
        .limit(limit);

      const data = rows.map((w) => ({
        id: w.id,
        chain: w.chain,
        // sourceTier='hot' → hot_to_cold; sourceTier='cold' → cold_to_hot
        direction: (w.sourceTier === 'cold' ? 'cold→hot' : 'hot→cold') as 'hot→cold' | 'cold→hot',
        amount: Number.parseFloat(w.amount),
        createdAt: w.createdAt.toISOString(),
        executedAt: w.broadcastAt ? w.broadcastAt.toISOString() : null,
        sigs: w.collectedSigs ?? 0,
        status: (w.status === 'completed'
          ? 'completed'
          : w.status === 'failed' || w.status === 'cancelled'
            ? 'failed'
            : 'awaiting_signatures') as 'awaiting_signatures' | 'completed' | 'failed',
        txHash: w.txHash ?? null,
        proposer: w.createdBy,
      }));

      return reply.send({ data });
    }
  );

  // ── POST /rebalance ───────────────────────────────────────────────────────────
  r.post(
    '/rebalance',
    {
      // Treasurers (and admins) can initiate rebalance; requires withdrawal.create permission
      preHandler: requirePerm('withdrawals.create'),
      schema: {
        tags: ['rebalance'],
        description:
          'Initiate a rebalance. Direction hot→cold or cold→hot. Destination auto-resolved from registry.',
        body: z.object({
          chain: z.enum(['bnb', 'sol']),
          token: z.enum(['USDT', 'USDC']),
          amountMinor: z
            .string()
            .regex(/^\d+(\.\d+)?$/, 'amountMinor must be a positive decimal string'),
          /** Direction of the rebalance — defaults to hot_to_cold for backward compatibility */
          direction: z.enum(['hot_to_cold', 'cold_to_hot']).default('hot_to_cold'),
        }),
        response: {
          201: z.object({
            withdrawalId: z.string().uuid(),
            multisigOpId: z.string().uuid(),
            destinationAddr: z.string(),
            status: z.string(),
          }),
          403: z.object({
            code: z.string(),
            message: z.string(),
            reasons: z.array(z.object({ rule: z.string(), message: z.string() })).optional(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const result = await createRebalance(
          app.db,
          {
            chain: req.body.chain,
            token: req.body.token,
            amountMinor: req.body.amountMinor,
            direction: req.body.direction,
          },
          staffId,
          app.io,
          getPolicyOpts()
        );
        return reply.code(201).send({
          withdrawalId: result.withdrawal.id,
          multisigOpId: result.multisigOp.id,
          destinationAddr: result.destinationAddr,
          status: result.withdrawal.status,
        });
      } catch (err) {
        if (err instanceof PolicyRejectedError) {
          return reply
            .code(403)
            .send({ code: err.code, message: err.message, reasons: err.reasons });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ValidationError) {
          return reply.code(422).send({ code: err.code, message: err.message });
        }
        if (err instanceof KillSwitchEnabledError) {
          return reply
            .code(503)
            .send({ code: 'KILL_SWITCH_ENABLED', message: (err as Error).message });
        }
        throw err;
      }
    }
  );
};

export default rebalanceRoutes;
