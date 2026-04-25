import { SigningSession, Withdrawal } from '@wp/shared-types';
import { eq } from 'drizzle-orm';
// Withdrawals routes — full CRUD + approve + execute + CSV export
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { notifyStaff } from '../services/notify-staff.service.js';
import { verifySigningSession } from '../services/signing-session-verifier.js';
import {
  countWithdrawalsForExport,
  queryWithdrawalsForExport,
  streamWithdrawalCsv,
} from '../services/withdrawal-csv.service.js';

const CSV_ROW_CAP = 50_000;
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

  // ── GET /withdrawals/export.csv — streaming CSV with filters + 50k cap ───────
  // Must be registered BEFORE /withdrawals/:id to avoid route conflict
  r.get(
    '/withdrawals/export.csv',
    {
      preHandler: requirePerm('withdrawals.read'),
      schema: {
        tags: ['withdrawals'],
        querystring: z.object({
          chain: z.enum(['bnb', 'sol']).optional(),
          tier: z.enum(['hot', 'cold']).optional(),
          status: z
            .enum([
              'pending',
              'approved',
              'time_locked',
              'executing',
              'broadcast',
              'cancelling',
              'completed',
              'cancelled',
              'failed',
            ])
            .optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
      },
    },
    async (req, reply) => {
      const { chain, tier, status, from, to } = req.query;
      const filterParams = {
        ...(chain !== undefined && { chain }),
        ...(tier !== undefined && { tier }),
        ...(status !== undefined && { status }),
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
      };

      const rowCount = await countWithdrawalsForExport(app.db, filterParams);
      if (rowCount > CSV_ROW_CAP) {
        return reply
          .code(429)
          .header('Retry-After', '0')
          .header('Content-Type', 'application/json')
          .send({ error: 'too_many_rows', max: CSV_ROW_CAP, found: rowCount });
      }

      const fromLabel = from ? from.slice(0, 10) : 'all';
      const toLabel = to ? to.slice(0, 10) : 'now';
      const filename = `withdrawals-${fromLabel}-to-${toLabel}.csv`;

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Transfer-Encoding', 'chunked');

      const rows = await queryWithdrawalsForExport(app.db, filterParams);
      streamWithdrawalCsv(rows, (chunk) => {
        reply.raw.write(chunk);
      });
      reply.raw.end();
    }
  );

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
              'broadcast',
              'cancelling',
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
          getPolicyOpts(),
          app.coldTimelockQueue
        );
        // Notify treasurers + admins of new withdrawal (fire-and-forget, non-fatal)
        notifyStaff(
          app.db,
          app.io,
          {
            role: 'treasurer',
            eventType: 'withdrawal.created',
            severity: 'info',
            title: 'New withdrawal request',
            body: `${withdrawal.amount} ${withdrawal.token} on ${withdrawal.chain} to ${withdrawal.destinationAddr}`,
            payload: {
              id: withdrawal.id,
              amount: withdrawal.amount,
              dest: withdrawal.destinationAddr,
            },
          },
          app.emailQueue,
          app.slackQueue
        ).catch((err) => app.log.error({ err }, 'notifyStaff failed'));
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
          // Mandatory SigningSession — backend verifies cryptographic integrity.
          // Missing or tampered session → HTTP 400.
          session: SigningSession,
          // Slice 7 HW-attestation: optional for hot-tier, required for cold-tier (enforced by policy-engine)
          attestationBlob: z.string().base64().optional(),
          attestationType: z.enum(['ledger', 'trezor']).optional(),
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
          400: z.object({ code: z.string(), message: z.string() }),
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

      // Mandatory cryptographic verification — reject missing/tampered session immediately.
      const verifyResult = verifySigningSession(
        req.body.session,
        req.body.signature,
        req.body.signerAddress
      );
      if (!verifyResult.ok) {
        app.log.warn(
          { withdrawalId: req.params.id, signerAddress: req.body.signerAddress },
          'signature verification failed'
        );
        return reply.code(400).send({
          code: 'INVALID_SIGNATURE',
          message: `Signature verification failed: ${verifyResult.reason}`,
        });
      }

      try {
        // Build input explicitly to satisfy exactOptionalPropertyTypes:
        // Zod infers optional fields as `T | undefined`; we only spread them when defined.
        const approveInput: import(
          '../services/withdrawal-approve.service.js'
        ).ApproveWithdrawalInput = {
          signature: req.body.signature,
          signerAddress: req.body.signerAddress,
          signedAt: req.body.signedAt,
          multisigOpId: req.body.multisigOpId,
          chain: req.body.chain,
          ...(req.body.attestationBlob !== undefined && {
            attestationBlob: req.body.attestationBlob,
          }),
          ...(req.body.attestationType !== undefined && {
            attestationType: req.body.attestationType,
          }),
        };
        const result = await approveWithdrawal(
          app.db,
          req.params.id,
          staffId,
          approveInput,
          app.io,
          getPolicyOpts()
        );
        // Notify treasurers of approval progress (fire-and-forget)
        notifyStaff(
          app.db,
          app.io,
          {
            role: 'treasurer',
            eventType: 'withdrawal.approved',
            severity: 'info',
            title: `Withdrawal signature added (${result.progress})`,
            body: result.thresholdMet
              ? 'Threshold met — ready to execute'
              : `${result.op.collectedSigs}/${result.op.requiredSigs} signatures collected`,
            payload: {
              withdrawalId: req.params.id,
              progress: result.progress,
              thresholdMet: result.thresholdMet,
            },
          },
          app.emailQueue,
          app.slackQueue
        ).catch((err) => app.log.error({ err }, 'notifyStaff failed'));
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
        // Notify admins that withdrawal broadcast was enqueued (fire-and-forget)
        notifyStaff(
          app.db,
          app.io,
          {
            role: 'admin',
            eventType: 'withdrawal.broadcast',
            severity: 'info',
            title: 'Withdrawal queued for broadcast',
            body: `Withdrawal ${req.params.id} enqueued for on-chain execution`,
            payload: { withdrawalId: req.params.id, jobId: result.jobId },
          },
          app.emailQueue,
          app.slackQueue
        ).catch((err) => app.log.error({ err }, 'notifyStaff failed'));
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

  // ── POST /withdrawals/:id/reject — treasurer rejects a pending withdrawal ────
  r.post(
    '/withdrawals/:id/reject',
    {
      preHandler: requirePerm('withdrawals.approve'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          reason: z.string().min(1).max(500).optional(),
        }),
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
          message: `Cannot reject withdrawal in status '${withdrawal.status}'`,
        });
      }
      await app.db
        .update(schema.withdrawals)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(schema.withdrawals.id, req.params.id));

      const { emitAudit } = await import('../services/audit.service.js');
      await emitAudit(app.db, {
        staffId,
        action: 'withdrawal.rejected',
        resourceType: 'withdrawal',
        resourceId: req.params.id,
        changes: {
          status: { from: withdrawal.status, to: 'cancelled' },
          reason: req.body.reason ?? null,
        },
      });

      app.io.of('/stream').emit('withdrawal.rejected', {
        withdrawalId: req.params.id,
        rejectedBy: staffId,
        reason: req.body.reason ?? null,
      });
      return reply.code(200).send({ ok: true });
    }
  );

  // ── POST /withdrawals/:id/submit — promote draft→pending ──────────────────
  r.post(
    '/withdrawals/:id/submit',
    {
      preHandler: requirePerm('withdrawals.create'),
      schema: {
        tags: ['withdrawals'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean(), status: z.string() }),
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
      // Only pending withdrawals without multisig op can be "submitted" (re-trigger multisig)
      if (withdrawal.status !== 'pending') {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `Cannot submit withdrawal in status '${withdrawal.status}'; only pending withdrawals can be submitted`,
        });
      }

      const { emitAudit } = await import('../services/audit.service.js');
      await emitAudit(app.db, {
        staffId,
        action: 'withdrawal.submitted',
        resourceType: 'withdrawal',
        resourceId: req.params.id,
        changes: { status: 'pending', submittedBy: staffId },
      });

      app.io.of('/stream').emit('withdrawal.submitted', { withdrawalId: req.params.id });
      return reply.code(200).send({ ok: true, status: withdrawal.status });
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

      // Remove the cold-timelock BullMQ delayed job if one exists.
      // jobId = withdrawalId (set at enqueue time) — safe no-op if job not present.
      try {
        const job = await app.coldTimelockQueue.getJob(req.params.id);
        if (job) await job.remove();
      } catch {
        // Non-fatal — job may not exist (hot-tier, already fired, or Redis eviction)
      }

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
