import { Withdrawal } from '@wp/shared-types';
import { eq } from 'drizzle-orm';
// Withdrawals routes — full CRUD + approve + execute (wired in Slice 1)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  ConflictError as ApproveConflictError,
  NotFoundError as ApproveNotFoundError,
  PolicyRejectedError as ApprovePolicyRejectedError,
  ForbiddenError,
  approveWithdrawal,
} from '../services/withdrawal-approve.service.js';
import {
  NotFoundError as CreateNotFoundError,
  PolicyRejectedError as CreatePolicyRejectedError,
  ValidationError,
  createWithdrawal,
} from '../services/withdrawal-create.service.js';
import {
  ConflictError as ExecConflictError,
  NotFoundError as ExecNotFoundError,
  executeWithdrawal,
} from '../services/withdrawal-execute.service.js';

const withdrawalsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Policy client options — read from env at request time (not startup) for testability
  const getPolicyOpts = () => ({
    baseUrl: process.env.POLICY_ENGINE_URL ?? 'http://localhost:3003',
    bearerToken: process.env.SVC_BEARER_TOKEN ?? '',
    timeoutMs: 2_000,
  });

  // ── GET /withdrawals ──────────────────────────────────────────────────────────
  r.get(
    '/withdrawals',
    {
      preHandler: requirePerm('withdrawals.read'),
      schema: {
        tags: ['withdrawals'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z
            .enum([
              'pending',
              'approved',
              'time_locked',
              'executing',
              'completed',
              'cancelled',
              'failed',
            ])
            .optional(),
        }),
        response: {
          200: z.object({
            data: z.array(Withdrawal),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit, status } = req.query;
      const offset = (page - 1) * limit;

      const rows = await app.db
        .select()
        .from(schema.withdrawals)
        .where(status ? eq(schema.withdrawals.status, status) : undefined)
        .limit(limit)
        .offset(offset)
        .orderBy(schema.withdrawals.createdAt);

      // Map DB rows to shared Withdrawal type (camelCase → camelCase, already matched)
      const data = rows.map((w) => ({
        id: w.id,
        userId: w.userId,
        chain: w.chain,
        token: w.token,
        amount: w.amount,
        destinationAddr: w.destinationAddr,
        status: w.status,
        sourceTier: w.sourceTier,
        multisigOpId: w.multisigOpId ?? null,
        timeLockExpiresAt: w.timeLockExpiresAt?.toISOString() ?? null,
        createdBy: w.createdBy,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      }));

      return reply.code(200).send({ data, total: data.length, page });
    }
  );

  // ── POST /withdrawals ─────────────────────────────────────────────────────────
  r.post(
    '/withdrawals',
    {
      preHandler: requirePerm('withdrawals.create'),
      schema: {
        tags: ['withdrawals'],
        body: z.object({
          userId: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']),
          token: z.enum(['USDT', 'USDC']),
          amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string'),
          destinationAddr: z.string().min(1),
          sourceTier: z.enum(['hot', 'cold']),
        }),
        response: {
          201: z.object({
            withdrawal: Withdrawal,
            multisigOpId: z.string().uuid(),
          }),
          403: z.object({
            code: z.string(),
            message: z.string(),
            reasons: z.array(z.object({ rule: z.string(), message: z.string() })).optional(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const { withdrawal, multisigOp } = await createWithdrawal(
          app.db,
          req.body,
          staffId,
          app.io,
          getPolicyOpts()
        );
        return reply.code(201).send({
          withdrawal: {
            id: withdrawal.id,
            userId: withdrawal.userId,
            chain: withdrawal.chain,
            token: withdrawal.token,
            amount: withdrawal.amount,
            destinationAddr: withdrawal.destinationAddr,
            status: withdrawal.status,
            sourceTier: withdrawal.sourceTier,
            multisigOpId: withdrawal.multisigOpId ?? null,
            timeLockExpiresAt: withdrawal.timeLockExpiresAt?.toISOString() ?? null,
            createdBy: withdrawal.createdBy,
            createdAt: withdrawal.createdAt.toISOString(),
            updatedAt: withdrawal.updatedAt.toISOString(),
          },
          multisigOpId: multisigOp.id,
        });
      } catch (err) {
        if (err instanceof CreatePolicyRejectedError) {
          return reply
            .code(403)
            .send({ code: err.code, message: err.message, reasons: err.reasons });
        }
        if (err instanceof CreateNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ValidationError) {
          return reply.code(422).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /withdrawals/:id/approve ─────────────────────────────────────────────
  r.post(
    '/withdrawals/:id/approve',
    {
      preHandler: requirePerm('withdrawals.approve'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          signature: z.string().min(1),
          signerAddress: z.string().min(1),
          signedAt: z.string().datetime(),
          multisigOpId: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']),
        }),
        response: {
          200: z.object({
            op: z.object({
              id: z.string().uuid(),
              collectedSigs: z.number().int(),
              requiredSigs: z.number().int(),
              status: z.string(),
            }),
            progress: z.string(),
            thresholdMet: z.boolean(),
          }),
          403: z.object({
            code: z.string(),
            message: z.string(),
            reasons: z.array(z.object({ rule: z.string(), message: z.string() })).optional(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const result = await approveWithdrawal(
          app.db,
          req.params.id,
          staffId,
          req.body,
          app.io,
          getPolicyOpts()
        );
        return reply.code(200).send({
          op: {
            id: result.op.id,
            collectedSigs: result.op.collectedSigs,
            requiredSigs: result.op.requiredSigs,
            status: result.op.status,
          },
          progress: result.progress,
          thresholdMet: result.thresholdMet,
        });
      } catch (err) {
        if (err instanceof ApprovePolicyRejectedError) {
          return reply
            .code(403)
            .send({ code: err.code, message: err.message, reasons: err.reasons });
        }
        if (err instanceof ForbiddenError) {
          return reply.code(403).send({ code: err.code, message: err.message });
        }
        if (err instanceof ApproveNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ApproveConflictError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /withdrawals/:id/execute ─────────────────────────────────────────────
  r.post(
    '/withdrawals/:id/execute',
    {
      preHandler: requirePerm('withdrawals.execute'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          202: z.object({ jobId: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const result = await executeWithdrawal(app.db, req.params.id, staffId, app.queue, app.io);
        return reply.code(202).send({ jobId: result.jobId });
      } catch (err) {
        if (err instanceof ExecNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ExecConflictError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /withdrawals/:id/cancel ──────────────────────────────────────────────
  r.post(
    '/withdrawals/:id/cancel',
    {
      preHandler: requirePerm('withdrawals.cancel'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      const withdrawal = await app.db.query.withdrawals.findFirst({
        where: eq(schema.withdrawals.id, req.params.id),
      });
      if (!withdrawal) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `Withdrawal ${req.params.id} not found` });
      }
      if (!['pending', 'approved', 'time_locked'].includes(withdrawal.status)) {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `Cannot cancel withdrawal in status '${withdrawal.status}'`,
        });
      }
      await app.db
        .update(schema.withdrawals)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(schema.withdrawals.id, req.params.id));

      // Emit audit inline (no transaction needed for cancel)
      const { emitAudit } = await import('../services/audit.service.js');
      await emitAudit(app.db, {
        staffId,
        action: 'withdrawal.cancelled',
        resourceType: 'withdrawal',
        resourceId: req.params.id,
        changes: { status: { from: withdrawal.status, to: 'cancelled' } },
      });

      app.io.of('/stream').emit('withdrawal.cancelled', { withdrawalId: req.params.id });
      return reply.code(200).send({ ok: true });
    }
  );
};

export default withdrawalsRoutes;
