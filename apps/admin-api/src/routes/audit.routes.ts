// Audit log routes — list, detail, verify chain, CSV export
// All routes gated by audit.read permission (admin + treasurer only)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { csvHeader, streamAuditCsv } from '../services/audit-csv.service.js';
import {
  countAuditLogs,
  getAuditLog,
  listAuditLogs,
  queryAuditLogsForExport,
} from '../services/audit-query.service.js';
import { verifyChain } from '../services/audit-verify.service.js';

const CSV_ROW_CAP = 50_000;

/** Wire-safe shape returned by list + detail endpoints */
const AuditLogEntryShape = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  actorEmail: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  changes: z.record(z.unknown()).nullable(),
  ipAddr: z.string().nullable(),
  ua: z.string().nullable(),
  prevHash: z.string().nullable(),
  hash: z.string(),
  createdAt: z.string(),
});

/** Shared filter querystring (list + export) */
const AuditFilterSchema = z.object({
  entity: z.string().optional(),
  actor: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const auditRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // GET /audit-logs — paginated + filtered list
  r.get(
    '/audit-logs',
    {
      preHandler: requirePerm('audit.read'),
      schema: {
        tags: ['audit'],
        querystring: AuditFilterSchema.extend({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(50),
        }),
        response: {
          200: z.object({
            data: z.array(AuditLogEntryShape),
            total: z.number().int(),
            page: z.number().int(),
            limit: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit, entity, actor, action, from, to } = req.query;
      const result = await listAuditLogs(app.db, {
        page,
        limit,
        ...(entity !== undefined && { entity }),
        ...(actor !== undefined && { actor }),
        ...(action !== undefined && { action }),
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
      });
      return reply.code(200).send(result);
    }
  );

  // GET /audit-logs/verify — hash chain recompute over a required date range
  // Must be registered BEFORE /audit-logs/:id to avoid route conflict
  r.get(
    '/audit-logs/verify',
    {
      preHandler: requirePerm('audit.read'),
      schema: {
        tags: ['audit'],
        querystring: z.object({
          from: z.string().datetime(),
          to: z.string().datetime(),
        }),
        response: {
          200: z.object({
            verified: z.boolean(),
            checked: z.number().int(),
            brokenAt: z.string().uuid().optional(),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { from, to } = req.query;
      if (!from || !to) {
        return reply.code(400).send({ error: 'Query params from and to are required' });
      }
      const result = await verifyChain(app.db, { from, to });
      return reply.code(200).send(result);
    }
  );

  // GET /audit-logs/export.csv — streaming CSV export with same filters + 50k cap
  r.get(
    '/audit-logs/export.csv',
    {
      preHandler: requirePerm('audit.read'),
      schema: {
        tags: ['audit'],
        querystring: AuditFilterSchema,
      },
    },
    async (req, reply) => {
      const { entity, actor, action, from, to } = req.query;
      const filterParams = {
        ...(entity !== undefined && { entity }),
        ...(actor !== undefined && { actor }),
        ...(action !== undefined && { action }),
        ...(from !== undefined && { from }),
        ...(to !== undefined && { to }),
      };

      // Count first to enforce 50k cap
      const rowCount = await countAuditLogs(app.db, filterParams);
      if (rowCount > CSV_ROW_CAP) {
        return reply
          .code(429)
          .header('Retry-After', '0')
          .header('Content-Type', 'application/json')
          .send({ error: 'too_many_rows', max: CSV_ROW_CAP, found: rowCount });
      }

      const fromLabel = from ? from.slice(0, 10) : 'all';
      const toLabel = to ? to.slice(0, 10) : 'now';
      const filename = `audit-${fromLabel}-to-${toLabel}.csv`;

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Transfer-Encoding', 'chunked');

      const rows = await queryAuditLogsForExport(app.db, filterParams);

      // Stream CSV via reply.raw to avoid buffering entire result
      streamAuditCsv(rows, (chunk) => {
        reply.raw.write(chunk);
      });
      reply.raw.end();
    }
  );

  // GET /audit-logs/:id — single row detail
  r.get(
    '/audit-logs/:id',
    {
      preHandler: requirePerm('audit.read'),
      schema: {
        tags: ['audit'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: AuditLogEntryShape,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const row = await getAuditLog(app.db, req.params.id);
      if (!row) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.code(200).send(row);
    }
  );
};

export default auditRoutes;
