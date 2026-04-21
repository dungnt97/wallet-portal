import { MultisigOp } from '@wp/shared-types';
import { eq } from 'drizzle-orm';
// Multisig routes — GET /multisig-ops, POST /multisig-ops/:id/submit-signature
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from '../services/audit.service.js';

const multisigRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /multisig-ops ─────────────────────────────────────────────────────────
  r.get(
    '/multisig-ops',
    {
      preHandler: requirePerm('multisig.read'),
      schema: {
        tags: ['multisig'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z
            .enum(['pending', 'collecting', 'ready', 'submitted', 'confirmed', 'expired', 'failed'])
            .optional(),
        }),
        response: {
          200: z.object({
            data: z.array(MultisigOp),
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
        .from(schema.multisigOperations)
        .where(status ? eq(schema.multisigOperations.status, status) : undefined)
        .limit(limit)
        .offset(offset)
        .orderBy(schema.multisigOperations.createdAt);

      const data = rows.map((op) => ({
        id: op.id,
        withdrawalId: op.withdrawalId ?? null,
        chain: op.chain,
        operationType: op.operationType,
        multisigAddr: op.multisigAddr,
        requiredSigs: op.requiredSigs,
        collectedSigs: op.collectedSigs,
        expiresAt: op.expiresAt.toISOString(),
        status: op.status,
        createdAt: op.createdAt.toISOString(),
        updatedAt: op.updatedAt.toISOString(),
      }));

      return reply.code(200).send({ data, total: data.length, page });
    }
  );

  // ── POST /multisig-ops/:id/submit-signature ───────────────────────────────────
  // Convenience alias — wraps the per-withdrawal approve endpoint logic directly.
  // Useful when caller has the op id but not the withdrawal id.
  r.post(
    '/multisig-ops/:id/submit-signature',
    {
      preHandler: requirePerm('multisig.sign'),
      schema: {
        tags: ['multisig'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          signature: z.string().min(1),
          signerAddress: z.string().min(1),
          signedAt: z.string().datetime().optional(),
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
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      const opId = req.params.id;

      // Load op
      const op = await app.db.query.multisigOperations.findFirst({
        where: eq(schema.multisigOperations.id, opId),
      });
      if (!op) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `MultisigOperation ${opId} not found` });
      }
      if (['ready', 'submitted', 'confirmed'].includes(op.status)) {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `MultisigOperation ${opId} already at status '${op.status}'`,
        });
      }
      if (new Date(op.expiresAt) < new Date()) {
        return reply
          .code(409)
          .send({ code: 'CONFLICT', message: `MultisigOperation ${opId} has expired` });
      }

      // Resolve signing key for this staff + chain + address
      const signingKey = await app.db.query.staffSigningKeys.findFirst({
        where: (k, { and, eq: eqFn }) =>
          and(
            eqFn(k.staffId, staffId),
            eqFn(k.chain, op.chain),
            eqFn(k.address, req.body.signerAddress)
          ),
      });
      if (!signingKey) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: `No signing key for staff ${staffId} on chain ${op.chain} with address ${req.body.signerAddress}`,
        });
      }

      // Duplicate check
      const dup = await app.db.query.multisigApprovals.findFirst({
        where: (a, { and, eq: eqFn }) =>
          and(eqFn(a.opId, opId), eqFn(a.staffSigningKeyId, signingKey.id)),
      });
      if (dup) {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `Staff ${staffId} already signed this operation`,
        });
      }

      // Transact: insert approval + increment
      let updatedOp: typeof schema.multisigOperations.$inferSelect | undefined;
      await app.db.transaction(async (tx) => {
        await tx.insert(schema.multisigApprovals).values({
          opId,
          staffId,
          staffSigningKeyId: signingKey.id,
          signature: req.body.signature,
          signedAt: new Date(req.body.signedAt ?? new Date().toISOString()),
        });

        const [updated] = await tx
          .update(schema.multisigOperations)
          .set({
            collectedSigs: op.collectedSigs + 1,
            status: op.collectedSigs + 1 >= op.requiredSigs ? 'ready' : 'collecting',
            updatedAt: new Date(),
          })
          .where(eq(schema.multisigOperations.id, opId))
          .returning();

        if (!updated) throw new Error('Failed to update multisig op');
        updatedOp = updated;

        await emitAudit(tx as unknown as typeof app.db, {
          staffId,
          action: 'multisig.signature_submitted',
          resourceType: 'multisig_operation',
          resourceId: opId,
          changes: {
            collectedSigs: updatedOp.collectedSigs,
            requiredSigs: updatedOp.requiredSigs,
            signerAddress: req.body.signerAddress,
          },
        });
      });

      if (!updatedOp)
        throw new Error('Transaction completed but updatedOp is undefined — unreachable');

      app.io.of('/stream').emit('multisig.progress', {
        opId,
        collectedSigs: updatedOp.collectedSigs,
        requiredSigs: updatedOp.requiredSigs,
        status: updatedOp.status,
      });

      return reply.code(200).send({
        op: {
          id: updatedOp.id,
          collectedSigs: updatedOp.collectedSigs,
          requiredSigs: updatedOp.requiredSigs,
          status: updatedOp.status,
        },
        progress: `${updatedOp.collectedSigs}/${updatedOp.requiredSigs}`,
      });
    }
  );
};

export default multisigRoutes;
