import type { Queue } from 'bullmq';
// Signer ceremony routes — add/remove/rotate multisig owners across Safe + Squads.
//
// GET  /signers/stats            — enriched signer stats for KPI strip
// POST /signers/add              — initiate signer_add ceremony (admin only)
// POST /signers/remove           — initiate signer_remove ceremony (admin only)
// POST /signers/rotate           — initiate signer_rotate ceremony (admin only)
// GET  /signers/ceremonies       — list ceremonies (paginated)
// GET  /signers/ceremonies/:id   — get single ceremony detail
// POST /signers/ceremonies/:id/cancel — cancel ceremony (admin only, idempotent)
import { count, desc, eq, gte, sql } from 'drizzle-orm';
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

// ── Signer stats response schema ──────────────────────────────────────────────

const SignerStatRow = z.object({
  staffId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  // Most recent signing activity (ISO string or null)
  lastActiveAt: z.string().nullable(),
  // Approvals by this signer in the last 30d
  sigCount30d: z.number().int(),
  // Age of the oldest active signing key in days (null = no key registered)
  oldestKeyAgeDays: z.number().int().nullable(),
  // EVM signing address (null if no key)
  evmAddr: z.string().nullable(),
  // Solana signing address (null if no key)
  solAddr: z.string().nullable(),
});

const signersRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /signers/stats ────────────────────────────────────────────────────
  // Returns enriched signer data for the KPI strip: last active time, sig counts,
  // key age. Requires signers.read permission (same as ceremonies list).

  r.get(
    '/signers/stats',
    {
      preHandler: requirePerm('signers.read'),
      schema: {
        tags: ['signers'],
        response: {
          200: z.object({ data: z.array(SignerStatRow) }),
        },
      },
    },
    async (_req, reply) => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Fetch all treasurer staff members
      const staffRows = await app.db
        .select()
        .from(schema.staffMembers)
        .where(eq(schema.staffMembers.role, 'treasurer'));

      if (staffRows.length === 0) {
        return reply.code(200).send({ data: [] });
      }

      const staffIds = staffRows.map((s) => s.id);

      // Sig counts in last 30d per staff (from multisig_approvals)
      const sigCounts = await app.db
        .select({
          staffId: schema.multisigApprovals.staffId,
          cnt: count(),
        })
        .from(schema.multisigApprovals)
        .where(gte(schema.multisigApprovals.signedAt, since30d))
        .groupBy(schema.multisigApprovals.staffId);

      // Build sigCount map
      const sigMap = new Map<string, number>();
      for (const row of sigCounts) sigMap.set(row.staffId, Number(row.cnt));

      // Signing keys per staff: oldest key age + EVM/SOL addresses
      const keyRows = await app.db.select().from(schema.staffSigningKeys);

      // Key info grouped by staffId
      const keyMap = new Map<
        string,
        { evmAddr: string | null; solAddr: string | null; oldestAgeDays: number | null }
      >();
      for (const key of keyRows) {
        if (!staffIds.includes(key.staffId)) continue;
        const existing = keyMap.get(key.staffId) ?? {
          evmAddr: null,
          solAddr: null,
          oldestAgeDays: null,
        };
        if (key.chain === 'bnb' && !key.revokedAt) {
          existing.evmAddr = key.address;
        }
        if (key.chain === 'sol' && !key.revokedAt) {
          existing.solAddr = key.address;
        }
        // Track oldest active key
        const ageDays = Math.floor(
          (Date.now() - key.registeredAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (existing.oldestAgeDays === null || ageDays > existing.oldestAgeDays) {
          existing.oldestAgeDays = ageDays;
        }
        keyMap.set(key.staffId, existing);
      }

      // Last active = most recent approval signedAt per staff
      const lastActiveRows = await app.db
        .select({
          staffId: schema.multisigApprovals.staffId,
          lastAt: sql<string>`MAX(${schema.multisigApprovals.signedAt})::text`,
        })
        .from(schema.multisigApprovals)
        .groupBy(schema.multisigApprovals.staffId);

      const lastActiveMap = new Map<string, string>();
      for (const row of lastActiveRows) lastActiveMap.set(row.staffId, row.lastAt);

      const data = staffRows.map((s) => {
        const keyInfo = keyMap.get(s.id);
        return {
          staffId: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          status: s.status,
          lastActiveAt: lastActiveMap.get(s.id) ?? s.lastLoginAt?.toISOString() ?? null,
          sigCount30d: sigMap.get(s.id) ?? 0,
          oldestKeyAgeDays: keyInfo?.oldestAgeDays ?? null,
          evmAddr: keyInfo?.evmAddr ?? null,
          solAddr: keyInfo?.solAddr ?? null,
        };
      });

      return reply.code(200).send({ data });
    }
  );

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
