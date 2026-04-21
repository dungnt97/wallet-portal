// notification-channels.routes.ts — GET /notification-channels
// Public (authenticated) read endpoint consumed by the UI routing matrix.
// Reads from DB tables notification_channels + notification_routing_rules.
// Write operations are on /admin/notification-* (admin-only).
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

const ChannelShape = z.object({
  id: z.string(),
  kind: z.enum(['email', 'slack', 'pagerduty', 'webhook']),
  label: z.string(),
  enabled: z.boolean(),
  filter: z.string(),
});

const EventKindShape = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(['info', 'warn', 'err']),
  routed: z.array(z.enum(['email', 'slack', 'pagerduty', 'webhook'])),
});

/** Human-readable labels for well-known event types */
const EVENT_LABELS: Record<string, string> = {
  'withdrawal.created': 'Withdrawal created',
  'withdrawal.approved': 'Withdrawal approved',
  'withdrawal.executed': 'Withdrawal executed',
  'deposit.credited': 'Deposit credited',
  'sweep.completed': 'Sweep completed',
  'multisig.threshold_met': 'Multisig threshold met',
  'signer.key_rotated': 'Signer key rotated',
  'killswitch.enabled': 'Kill switch enabled',
};

const notifChannelsRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/notification-channels',
    {
      preHandler: requirePerm('deposits.read'),
      schema: {
        tags: ['notifications'],
        response: {
          200: z.object({
            channels: z.array(ChannelShape),
            eventKinds: z.array(EventKindShape),
          }),
        },
      },
    },
    async (_req, reply) => {
      // Load channels from DB
      const channelRows = await app.db
        .select()
        .from(schema.notificationChannels)
        .orderBy(schema.notificationChannels.createdAt);

      // Load enabled routing rules
      const ruleRows = await app.db
        .select()
        .from(schema.notificationRoutingRules)
        .where(eq(schema.notificationRoutingRules.enabled, true));

      // Map channels to UI shape (label = name, filter = severityFilter)
      const channels = channelRows.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.name,
        enabled: c.enabled,
        filter: c.severityFilter,
      }));

      // Derive distinct event types from rules, build routed channel kinds per event
      const eventMap = new Map<
        string,
        { severity: schema.NotifSeverityFilter; routed: Set<schema.NotifChannelKind> }
      >();

      for (const rule of ruleRows) {
        if (!eventMap.has(rule.eventType)) {
          eventMap.set(rule.eventType, { severity: rule.severity, routed: new Set() });
        }
        eventMap.get(rule.eventType)?.routed.add(rule.channelKind);
      }

      const eventKinds = Array.from(eventMap.entries()).map(([id, { severity, routed }]) => ({
        id,
        label: EVENT_LABELS[id] ?? id,
        severity,
        routed: Array.from(routed),
      }));

      return reply.send({ channels, eventKinds });
    }
  );
};

export default notifChannelsRoutes;
