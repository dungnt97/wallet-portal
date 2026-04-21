import type { Queue } from 'bullmq';
// Signer ceremony routes — add/remove/rotate multisig owners across Safe + Squads.
//
// POST /signers/add              — initiate signer_add ceremony (admin only)
// POST /signers/remove           — initiate signer_remove ceremony (admin only)
// POST /signers/rotate           — initiate signer_rotate ceremony (admin only)
// GET  /signers/ceremonies       — list ceremonies (paginated)
// GET  /signers/ceremonies/:id   — get single ceremony detail
// POST /signers/ceremonies/:id/cancel — cancel ceremony (admin only, idempotent)
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  NotFoundError as AddNotFound,
  ValidationError as AddValidation,
  addSigner,
} from '../services/signer-add.service.js';
import type { CeremonyJobData } from '../services/signer-add.service.js';
import {
  NotFoundError as CancelNotFound,
  ConflictError,
  cancelCeremony,
} from '../services/signer-ceremony-cancel.service.js';
import {
  NotFoundError as RemoveNotFound,
  ValidationError as RemoveValidation,
  removeSigner,
} from '../services/signer-remove.service.js';
import {
  NotFoundError as RotateNotFound,
  ValidationError as RotateValidation,
  rotateSigners,
} from '../services/signer-rotate.service.js';

// ── Shared Zod shapes ─────────────────────────────────────────────────────────

const CeremonyStatusZ = z.enum([
  'pending',
  'in_progress',
  'confirmed',
  'partial',
  'failed',
  'cancelled',
]);

const CeremonyRowZ = z.object({
  id: z.string().uuid(),
  operationType: z.enum(['signer_add', 'signer_remove', 'signer_rotate']),
  initiatedBy: z.string().uuid(),
  targetAdd: z.array(z.string().uuid()),
  targetRemove: z.array(z.string().uuid()),
  chainStates: z.record(z.unknown()),
  status: CeremonyStatusZ,
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Helper ─────────────────────────────────────────────────────────────────────

function serializeCeremony(row: typeof schema.signerCeremonies.$inferSelect) {
  return {
    id: row.id,
    operationType: row.operationType,
    initiatedBy: row.initiatedBy,
    targetAdd: row.targetAdd,
    targetRemove: row.targetRemove,
    chainStates: row.chainStates ?? {},
    status: row.status,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const signersRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── POST /signers/add ─────────────────────────────────────────────────────

  r.post(
    '/signers/add',
    {
      preHandler: requirePerm('signers.manage'),
      schema: {
        tags: ['signers'],
        body: z.object({
          targetStaffId: z.string().uuid(),
          reason: z.string().optional(),
        }),
        response: {
          201: z.object({
            ceremonyId: z.string().uuid(),
            bnbOpId: z.string().uuid(),
            solanaOpId: z.string().uuid(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await addSigner(
          app.db,
          staffId,
          req.body,
          app.io,
          app.ceremonyQueue as Queue<CeremonyJobData>,
          app.emailQueue,
          app.slackQueue
        );
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof AddNotFound)
          return reply.code(404).send({ code: err.code, message: err.message });
        if (err instanceof AddValidation)
          return reply.code(422).send({ code: err.code, message: err.message });
        throw err;
      }
    }
  );

  // ── POST /signers/remove ──────────────────────────────────────────────────

  r.post(
    '/signers/remove',
    {
      preHandler: requirePerm('signers.manage'),
      schema: {
        tags: ['signers'],
        body: z.object({
          targetStaffId: z.string().uuid(),
          reason: z.string().optional(),
        }),
        response: {
          201: z.object({
            ceremonyId: z.string().uuid(),
            bnbOpId: z.string().uuid(),
            solanaOpId: z.string().uuid(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await removeSigner(
          app.db,
          staffId,
          req.body,
          app.io,
          app.ceremonyQueue as Queue<CeremonyJobData>,
          app.emailQueue,
          app.slackQueue
        );
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof RemoveNotFound)
          return reply.code(404).send({ code: err.code, message: err.message });
        if (err instanceof RemoveValidation)
          return reply.code(422).send({ code: err.code, message: err.message });
        throw err;
      }
    }
  );

  // ── POST /signers/rotate ──────────────────────────────────────────────────

  r.post(
    '/signers/rotate',
    {
      preHandler: requirePerm('signers.manage'),
      schema: {
        tags: ['signers'],
        body: z.object({
          addStaffIds: z.array(z.string().uuid()).min(1),
          removeStaffIds: z.array(z.string().uuid()).min(1),
          reason: z.string().optional(),
        }),
        response: {
          201: z.object({
            ceremonyId: z.string().uuid(),
            bnbOpId: z.string().uuid(),
            solanaOpId: z.string().uuid(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await rotateSigners(
          app.db,
          staffId,
          req.body,
          app.io,
          app.ceremonyQueue as Queue<CeremonyJobData>,
          app.emailQueue,
          app.slackQueue
        );
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof RotateNotFound)
          return reply.code(404).send({ code: err.code, message: err.message });
        if (err instanceof RotateValidation)
          return reply.code(422).send({ code: err.code, message: err.message });
        throw err;
      }
    }
  );

  // ── GET /signers/ceremonies ───────────────────────────────────────────────

  r.get(
    '/signers/ceremonies',
    {
      preHandler: requirePerm('signers.read'),
      schema: {
        tags: ['signers'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: CeremonyStatusZ.optional(),
        }),
        response: {
          200: z.object({
            data: z.array(CeremonyRowZ),
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
        .from(schema.signerCeremonies)
        .where(status ? eq(schema.signerCeremonies.status, status) : undefined)
        .orderBy(desc(schema.signerCeremonies.createdAt))
        .limit(limit)
        .offset(offset);

      // Count total (simple approach: full table count with same filter)
      const allRows = await app.db
        .select({ id: schema.signerCeremonies.id })
        .from(schema.signerCeremonies)
        .where(status ? eq(schema.signerCeremonies.status, status) : undefined);

      return reply.code(200).send({
        data: rows.map(serializeCeremony),
        total: allRows.length,
        page,
      });
    }
  );

  // ── GET /signers/ceremonies/:id ───────────────────────────────────────────

  r.get(
    '/signers/ceremonies/:id',
    {
      preHandler: requirePerm('signers.read'),
      schema: {
        tags: ['signers'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: CeremonyRowZ,
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const row = await app.db.query.signerCeremonies.findFirst({
        where: eq(schema.signerCeremonies.id, req.params.id),
      });
      if (!row) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `Ceremony ${req.params.id} not found` });
      }
      return reply.code(200).send(serializeCeremony(row));
    }
  );

  // ── POST /signers/ceremonies/:id/cancel ───────────────────────────────────

  r.post(
    '/signers/ceremonies/:id/cancel',
    {
      preHandler: requirePerm('signers.manage'),
      schema: {
        tags: ['signers'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          204: z.null(),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        await cancelCeremony(app.db, req.params.id, staffId);
        return reply.code(204).send(null);
      } catch (err) {
        if (err instanceof CancelNotFound)
          return reply.code(404).send({ code: err.code, message: err.message });
        if (err instanceof ConflictError)
          return reply.code(409).send({ code: err.code, message: err.message });
        throw err;
      }
    }
  );
};

export default signersRoutes;
