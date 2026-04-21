// notification-admin.routes.ts — admin CRUD for notification_channels + routing rules.
// Requires 'notifications.manage' permission (admin-only).
//
// Endpoints:
//   GET    /admin/notification-channels
//   POST   /admin/notification-channels
//   PATCH  /admin/notification-channels/:id
//   DELETE /admin/notification-channels/:id
//   POST   /admin/notification-channels/:id/test
//   GET    /admin/notification-routing
//   PATCH  /admin/notification-routing
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

// ── Shared Zod shapes ─────────────────────────────────────────────────────────

const ChannelKindEnum = z.enum(['email', 'slack', 'pagerduty', 'webhook']);
const SeverityFilterEnum = z.enum(['info', 'warn', 'err']);

const ChannelResponse = z.object({
  id: z.string().uuid(),
  kind: ChannelKindEnum,
  name: z.string(),
  target: z.string(),
  enabled: z.boolean(),
  severityFilter: SeverityFilterEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const RoutingRuleResponse = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  severity: SeverityFilterEnum,
  channelKind: ChannelKindEnum,
  enabled: z.boolean(),
});

// ── Helper: serialize DB row to response shape ────────────────────────────────

function serializeChannel(row: schema.NotificationChannelRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    target: row.target,
    enabled: row.enabled,
    severityFilter: row.severityFilter,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRule(row: schema.NotificationRoutingRuleRow) {
  return {
    id: row.id,
    eventType: row.eventType,
    severity: row.severity,
    channelKind: row.channelKind,
    enabled: row.enabled,
  };
}

// ── Helper: fire a test notification to a single channel ─────────────────────

async function fireTestToChannel(
  channel: schema.NotificationChannelRow,
  log: { info: (msg: string) => void }
): Promise<void> {
  const testPayload = {
    title: '[TEST] Notification channel test',
    body: 'This is a test notification. If you received this, the channel is configured correctly.',
    eventType: 'system.channel_test',
    severity: 'info' as const,
  };

  log.info(`[notif-admin] Test firing to channel ${channel.id} kind=${channel.kind}`);

  if (channel.kind === 'email') {
    // Email test — log only (SMTP worker integration is out of scope for this stub,
    // since the email worker reads from per-staff prefs queue; a future slice can wire it)
    log.info(`[notif-admin] Test email would send to: ${channel.target}`);
    return;
  }

  if (channel.kind === 'slack') {
    try {
      const res = await fetch(channel.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${testPayload.title}*\n${testPayload.body}`,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        log.info(`[notif-admin] Slack test failed status=${res.status}`);
      }
    } catch (err) {
      log.info(`[notif-admin] Slack test error: ${String(err)}`);
    }
    return;
  }

  if (channel.kind === 'webhook' || channel.kind === 'pagerduty') {
    try {
      const res = await fetch(channel.target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_action: 'trigger',
          payload: {
            summary: testPayload.title,
            severity: 'info',
            source: 'wallet-portal',
            custom_details: { body: testPayload.body },
          },
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        log.info(`[notif-admin] ${channel.kind} test failed status=${res.status}`);
      }
    } catch (err) {
      log.info(`[notif-admin] ${channel.kind} test error: ${String(err)}`);
    }
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

const notificationAdminRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const adminGuard = { preHandler: requirePerm('notifications.manage') };

  // GET /admin/notification-channels — list all channels
  r.get(
    '/admin/notification-channels',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        response: { 200: z.object({ data: z.array(ChannelResponse) }) },
      },
    },
    async (_req, reply) => {
      const rows = await app.db
        .select()
        .from(schema.notificationChannels)
        .orderBy(schema.notificationChannels.createdAt);
      return reply.send({ data: rows.map(serializeChannel) });
    }
  );

  // POST /admin/notification-channels — create
  r.post(
    '/admin/notification-channels',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        body: z.object({
          kind: ChannelKindEnum,
          name: z.string().min(1).max(200),
          target: z.string().min(1).max(500),
          enabled: z.boolean().default(true),
          severityFilter: SeverityFilterEnum.default('info'),
        }),
        response: { 201: ChannelResponse },
      },
    },
    async (req, reply) => {
      const now = new Date();
      const [row] = await app.db
        .insert(schema.notificationChannels)
        .values({ ...req.body, createdAt: now, updatedAt: now })
        .returning();
      if (!row) throw new Error('INSERT returned no row');
      return reply.code(201).send(serializeChannel(row));
    }
  );

  // PATCH /admin/notification-channels/:id — partial update
  r.patch(
    '/admin/notification-channels/:id',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(200).optional(),
          target: z.string().min(1).max(500).optional(),
          enabled: z.boolean().optional(),
          severityFilter: SeverityFilterEnum.optional(),
        }),
        response: {
          200: ChannelResponse,
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const [row] = await app.db
        .update(schema.notificationChannels)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(schema.notificationChannels.id, id))
        .returning();
      if (!row) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Channel not found' });
      }
      return reply.send(serializeChannel(row));
    }
  );

  // DELETE /admin/notification-channels/:id — hard delete
  r.delete(
    '/admin/notification-channels/:id',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const [deleted] = await app.db
        .delete(schema.notificationChannels)
        .where(eq(schema.notificationChannels.id, id))
        .returning({ id: schema.notificationChannels.id });
      if (!deleted) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Channel not found' });
      }
      return reply.send({ ok: true });
    }
  );

  // POST /admin/notification-channels/:id/test — fire test notification
  r.post(
    '/admin/notification-channels/:id/test',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean(), channelKind: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const [channel] = await app.db
        .select()
        .from(schema.notificationChannels)
        .where(eq(schema.notificationChannels.id, id));
      if (!channel) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Channel not found' });
      }
      // Fire async — do not await to keep response fast
      fireTestToChannel(channel, app.log).catch((err: unknown) =>
        app.log.error({ err }, 'Test notification fire failed')
      );
      return reply.send({ ok: true, channelKind: channel.kind });
    }
  );

  // GET /admin/notification-routing — list all routing rules
  r.get(
    '/admin/notification-routing',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        response: { 200: z.object({ data: z.array(RoutingRuleResponse) }) },
      },
    },
    async (_req, reply) => {
      const rows = await app.db
        .select()
        .from(schema.notificationRoutingRules)
        .orderBy(
          schema.notificationRoutingRules.eventType,
          schema.notificationRoutingRules.channelKind
        );
      return reply.send({ data: rows.map(serializeRule) });
    }
  );

  // PATCH /admin/notification-routing — upsert a single routing rule
  r.patch(
    '/admin/notification-routing',
    {
      ...adminGuard,
      schema: {
        tags: ['notification-admin'],
        body: z.object({
          eventType: z.string().min(1),
          severity: SeverityFilterEnum,
          channelKind: ChannelKindEnum,
          enabled: z.boolean(),
        }),
        response: { 200: RoutingRuleResponse },
      },
    },
    async (req, reply) => {
      const { eventType, severity, channelKind, enabled } = req.body;
      const now = new Date();
      const [row] = await app.db
        .insert(schema.notificationRoutingRules)
        .values({ eventType, severity, channelKind, enabled, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [
            schema.notificationRoutingRules.eventType,
            schema.notificationRoutingRules.channelKind,
          ],
          set: { enabled, severity, updatedAt: now },
        })
        .returning();
      if (!row) throw new Error('UPSERT returned no row');
      return reply.send(serializeRule(row));
    }
  );
};

export default notificationAdminRoutes;
