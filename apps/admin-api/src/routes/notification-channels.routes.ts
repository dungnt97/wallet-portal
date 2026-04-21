// Notification channels routes — GET /notification-channels
// Returns the static channel configuration and event routing matrix.
// No DB table yet — channels are environment-configured. This stub returns
// the default configuration so the UI can display it without fixture data.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';

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

/** Default channel config — will be replaced by DB-persisted config in a later slice */
const DEFAULT_CHANNELS = [
  {
    id: 'ch_email',
    kind: 'email' as const,
    label: 'treasury@company.io',
    enabled: true,
    filter: 'warn',
  },
  {
    id: 'ch_slack',
    kind: 'slack' as const,
    label: '#treasury-alerts',
    enabled: true,
    filter: 'all',
  },
  { id: 'ch_pd', kind: 'pagerduty' as const, label: 'Treasury PD', enabled: false, filter: 'err' },
  { id: 'ch_hook', kind: 'webhook' as const, label: 'SIEM webhook', enabled: false, filter: 'all' },
];

type ChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';
type Severity = 'info' | 'warn' | 'err';

const DEFAULT_EVENT_KINDS: {
  id: string;
  label: string;
  severity: Severity;
  routed: ChannelKind[];
}[] = [
  {
    id: 'withdrawal.created',
    label: 'Withdrawal created',
    severity: 'info',
    routed: ['email', 'slack'],
  },
  { id: 'withdrawal.approved', label: 'Withdrawal approved', severity: 'info', routed: ['slack'] },
  {
    id: 'withdrawal.executed',
    label: 'Withdrawal executed',
    severity: 'warn',
    routed: ['email', 'slack', 'webhook'],
  },
  { id: 'deposit.credited', label: 'Deposit credited', severity: 'info', routed: ['slack'] },
  { id: 'sweep.completed', label: 'Sweep completed', severity: 'info', routed: ['slack'] },
  {
    id: 'multisig.threshold_met',
    label: 'Multisig threshold met',
    severity: 'warn',
    routed: ['email', 'slack', 'pagerduty'],
  },
  {
    id: 'signer.key_rotated',
    label: 'Signer key rotated',
    severity: 'warn',
    routed: ['email', 'slack', 'pagerduty'],
  },
  {
    id: 'killswitch.enabled',
    label: 'Kill switch enabled',
    severity: 'err',
    routed: ['email', 'slack', 'pagerduty', 'webhook'],
  },
];

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
      return reply.send({
        channels: DEFAULT_CHANNELS,
        eventKinds: DEFAULT_EVENT_KINDS,
      });
    }
  );
};

export default notifChannelsRoutes;
