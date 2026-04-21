// Notifications routes — read + mark-read + prefs for the authenticated staff member.
// All routes require authentication; staff can only access their own notifications.
// Admin: can also pass staffId query param to read another staff's notifications.
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import { DEFAULT_NOTIFICATION_PREFS } from '../db/schema/notifications.js';
import { invalidateStaffPrefsCache } from '../services/notification-prefs.service.js';

// ── Response schemas ──────────────────────────────────────────────────────────

const NotificationItemSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  eventType: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  body: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  dedupeKey: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  digestSentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const NotificationEventPrefsSchema = z.object({
  withdrawal: z.boolean(),
  sweep: z.boolean(),
  deposit: z.boolean(),
  killSwitch: z.boolean(),
  reorg: z.boolean(),
  health: z.boolean(),
  coldTimelock: z.boolean(),
});

const NotificationPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  slack: z.boolean(),
  eventTypes: NotificationEventPrefsSchema,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Serialize a DB notification row to API response shape */
function serializeNotif(row: typeof schema.notifications.$inferSelect) {
  return {
    id: row.id,
    staffId: row.staffId,
    eventType: row.eventType,
    severity: row.severity,
    title: row.title,
    body: row.body ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    dedupeKey: row.dedupeKey ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    digestSentAt: row.digestSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const notificationsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /notifications ────────────────────────────────────────────────────────
  r.get(
    '/notifications',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(100).default(50),
          unread: z
            .string()
            .optional()
            .transform((v) => v === 'true'),
          /** Admin only: read another staff member's notifications */
          staffId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(NotificationItemSchema),
            total: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { limit, unread, staffId: queryStaffId } = req.query;
      // requireAuth() preHandler guarantees staff is present; fallback never reached at runtime
      const self = req.session.staff ?? { id: '', role: 'viewer' as const };

      // RBAC: non-admins can only read their own notifications
      const targetStaffId = queryStaffId && self.role === 'admin' ? queryStaffId : self.id;

      const conditions = [eq(schema.notifications.staffId, targetStaffId)];
      if (unread) {
        conditions.push(isNull(schema.notifications.readAt));
      }

      const rows = await app.db
        .select()
        .from(schema.notifications)
        .where(and(...conditions))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(limit);

      return reply.send({ data: rows.map(serializeNotif), total: rows.length });
    }
  );

  // ── GET /notifications/unread-count ──────────────────────────────────────────
  r.get(
    '/notifications/unread-count',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        response: {
          200: z.object({ count: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';

      const [result] = await app.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.notifications)
        .where(and(eq(schema.notifications.staffId, staffId), isNull(schema.notifications.readAt)));

      return reply.send({ count: result?.count ?? 0 });
    }
  );

  // ── POST /notifications/:id/read ─────────────────────────────────────────────
  r.post(
    '/notifications/:id/read',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const staffId = req.session.staff?.id ?? '';

      const updated = await app.db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.id, id),
            eq(schema.notifications.staffId, staffId),
            isNull(schema.notifications.readAt)
          )
        )
        .returning({ id: schema.notifications.id });

      if (updated.length === 0) {
        // Either not found or already read — both are safe to 404
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: 'Notification not found or already read' });
      }

      return reply.send({ ok: true });
    }
  );

  // ── POST /notifications/mark-all-read ────────────────────────────────────────
  r.post(
    '/notifications/mark-all-read',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        response: {
          200: z.object({ ok: z.literal(true), updated: z.number().int() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';

      const updated = await app.db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(and(eq(schema.notifications.staffId, staffId), isNull(schema.notifications.readAt)))
        .returning({ id: schema.notifications.id });

      return reply.send({ ok: true, updated: updated.length });
    }
  );

  // ── GET /staff/me/notification-prefs ─────────────────────────────────────────
  r.get(
    '/staff/me/notification-prefs',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        response: {
          200: NotificationPrefsSchema,
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';

      const row = await app.db.query.staffMembers.findFirst({
        where: eq(schema.staffMembers.id, staffId),
        columns: { notificationPrefs: true },
      });

      const prefs = row?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
      return reply.send(prefs);
    }
  );

  // ── PATCH /staff/me/notification-prefs ────────────────────────────────────────
  r.patch(
    '/staff/me/notification-prefs',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['notifications'],
        body: NotificationPrefsSchema.partial().extend({
          eventTypes: NotificationEventPrefsSchema.partial().optional(),
        }),
        response: {
          200: NotificationPrefsSchema,
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      const patch = req.body;

      // Fetch current prefs to merge
      const row = await app.db.query.staffMembers.findFirst({
        where: eq(schema.staffMembers.id, staffId),
        columns: { notificationPrefs: true },
      });

      if (!row) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Staff member not found' });
      }

      const current = row.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;

      // Deep-merge: top-level + eventTypes sub-object.
      // Cast required: spread of Partial<> introduces undefined for absent fields,
      // but we start from a complete `current` so all required fields are present.
      const merged = {
        inApp: patch.inApp ?? current.inApp,
        email: patch.email ?? current.email,
        slack: patch.slack ?? current.slack,
        eventTypes: {
          withdrawal: patch.eventTypes?.withdrawal ?? current.eventTypes.withdrawal,
          sweep: patch.eventTypes?.sweep ?? current.eventTypes.sweep,
          deposit: patch.eventTypes?.deposit ?? current.eventTypes.deposit,
          killSwitch: patch.eventTypes?.killSwitch ?? current.eventTypes.killSwitch,
          reorg: patch.eventTypes?.reorg ?? current.eventTypes.reorg,
          health: patch.eventTypes?.health ?? current.eventTypes.health,
          coldTimelock: patch.eventTypes?.coldTimelock ?? current.eventTypes.coldTimelock,
        },
      };

      await app.db
        .update(schema.staffMembers)
        .set({ notificationPrefs: merged })
        .where(eq(schema.staffMembers.id, staffId));

      // Invalidate in-process prefs cache so notifyStaff picks up new values
      invalidateStaffPrefsCache(staffId);

      return reply.send(merged);
    }
  );
};

export default notificationsRoutes;
