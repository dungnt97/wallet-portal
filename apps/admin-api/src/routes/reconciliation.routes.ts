import { ReconciliationDrift, ReconciliationSnapshot, RunSnapshotBody } from '@wp/shared-types';
// reconciliation.routes — admin-api REST endpoints for Slice 10 reconciliation.
//
//   POST /reconciliation/run          (admin) — enqueue ad-hoc snapshot
//   GET  /reconciliation/snapshots    (ops+)  — paginated list
//   GET  /reconciliation/snapshots/:id        — detail + drift rows
//   POST /reconciliation/snapshots/:id/cancel (admin) — cancel running snapshot
//
// Idempotency guard on POST /run: returns 409 if another run is active within last 10min.
// RECON_ENABLED=false → all routes return 503.
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import type { ReconRunJobData } from '../workers/reconciliation-snapshot.worker.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.RECON_ENABLED !== 'false';
}

function snapshotToDto(
  row: typeof schema.reconciliationSnapshots.$inferSelect
): z.infer<typeof ReconciliationSnapshot> {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    triggeredBy: row.triggeredBy ?? null,
    status: row.status as z.infer<typeof ReconciliationSnapshot>['status'],
    chain: row.chain ?? null,
    scope: row.scope as z.infer<typeof ReconciliationSnapshot>['scope'],
    onChainTotalMinor: row.onChainTotalMinor !== null ? row.onChainTotalMinor.toString() : null,
    ledgerTotalMinor: row.ledgerTotalMinor !== null ? row.ledgerTotalMinor.toString() : null,
    driftTotalMinor: row.driftTotalMinor !== null ? row.driftTotalMinor.toString() : null,
    errorMessage: row.errorMessage ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function driftToDto(
  row: typeof schema.reconciliationDrifts.$inferSelect
): z.infer<typeof ReconciliationDrift> {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    chain: row.chain,
    token: row.token,
    address: row.address,
    accountLabel: row.accountLabel,
    onChainMinor: row.onChainMinor.toString(),
    ledgerMinor: row.ledgerMinor.toString(),
    driftMinor: row.driftMinor.toString(),
    severity: row.severity as z.infer<typeof ReconciliationDrift>['severity'],
    suppressedReason: row.suppressedReason ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Disabled guard — applies to all routes in this plugin
  app.addHook('preHandler', async (_req, reply) => {
    if (!isEnabled()) {
      return reply
        .code(503)
        .send({ code: 'RECON_DISABLED', message: 'Reconciliation is disabled' });
    }
  });

  // ── POST /reconciliation/run ────────────────────────────────────────────────
  r.post(
    '/reconciliation/run',
    {
      preHandler: requirePerm('reconciliation.run'),
      schema: {
        tags: ['reconciliation'],
        body: RunSnapshotBody,
        response: {
          202: z.object({ jobId: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string(), snapshotId: z.string() }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;

      // Idempotency: refuse if another run is active within last 10min
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const existing = await app.db
        .select({ id: schema.reconciliationSnapshots.id })
        .from(schema.reconciliationSnapshots)
        .where(
          and(
            eq(schema.reconciliationSnapshots.status, 'running'),
            gt(schema.reconciliationSnapshots.createdAt, tenMinAgo)
          )
        )
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        return reply.code(409).send({
          code: 'RECON_ALREADY_RUNNING',
          message: 'A reconciliation snapshot is already running',
          snapshotId: existing[0].id,
        });
      }

      const jobData: ReconRunJobData = {
        triggeredBy: staffId,
        ...(req.body.chain !== undefined && { chain: req.body.chain }),
        ...(req.body.scope !== undefined && { scope: req.body.scope }),
      };

      const job = await app.reconQueue.add('recon-manual', jobData, {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      });

      return reply.code(202).send({
        jobId: job.id ?? 'unknown',
        message: 'Reconciliation snapshot enqueued',
      });
    }
  );

  // ── GET /reconciliation/snapshots ───────────────────────────────────────────
  r.get(
    '/reconciliation/snapshots',
    {
      preHandler: requirePerm('reconciliation.read'),
      schema: {
        tags: ['reconciliation'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          status: z.enum(['running', 'completed', 'failed', 'cancelled']).optional(),
        }),
        response: {
          200: z.object({
            data: z.array(ReconciliationSnapshot),
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
        .from(schema.reconciliationSnapshots)
        .where(status ? eq(schema.reconciliationSnapshots.status, status) : undefined)
        .orderBy(desc(schema.reconciliationSnapshots.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await app.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.reconciliationSnapshots)
        .where(status ? eq(schema.reconciliationSnapshots.status, status) : undefined);

      return reply.code(200).send({
        data: rows.map(snapshotToDto),
        total: countRow?.count ?? 0,
        page,
      });
    }
  );

  // ── GET /reconciliation/snapshots/:id ───────────────────────────────────────
  r.get(
    '/reconciliation/snapshots/:id',
    {
      preHandler: requirePerm('reconciliation.read'),
      schema: {
        tags: ['reconciliation'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            snapshot: ReconciliationSnapshot,
            drifts: z.array(ReconciliationDrift),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const snapshot = await app.db.query.reconciliationSnapshots.findFirst({
        where: eq(schema.reconciliationSnapshots.id, req.params.id),
      });

      if (!snapshot) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: `Snapshot ${req.params.id} not found`,
        });
      }

      const drifts = await app.db
        .select()
        .from(schema.reconciliationDrifts)
        .where(eq(schema.reconciliationDrifts.snapshotId, req.params.id))
        .orderBy(desc(schema.reconciliationDrifts.driftMinor));

      return reply.code(200).send({
        snapshot: snapshotToDto(snapshot),
        drifts: drifts.map(driftToDto),
      });
    }
  );

  // ── POST /reconciliation/snapshots/:id/cancel ───────────────────────────────
  r.post(
    '/reconciliation/snapshots/:id/cancel',
    {
      preHandler: requirePerm('reconciliation.run'),
      schema: {
        tags: ['reconciliation'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const snapshot = await app.db.query.reconciliationSnapshots.findFirst({
        where: eq(schema.reconciliationSnapshots.id, req.params.id),
      });

      if (!snapshot) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: `Snapshot ${req.params.id} not found`,
        });
      }

      if (snapshot.status !== 'running') {
        return reply.code(409).send({
          code: 'CONFLICT',
          message: `Cannot cancel snapshot in status '${snapshot.status}'`,
        });
      }

      await app.db
        .update(schema.reconciliationSnapshots)
        .set({ status: 'cancelled', completedAt: new Date() })
        .where(eq(schema.reconciliationSnapshots.id, req.params.id));

      return reply.code(200).send({ ok: true });
    }
  );
};

export default reconciliationRoutes;
