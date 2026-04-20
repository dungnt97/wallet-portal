// Notification routing fixtures — channel directory + event→channel matrix.

export type NotifSeverity = 'info' | 'warn' | 'err';
export type ChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';

export interface Channel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  filter: string;
}

export interface EventKind {
  id: string;
  label: string;
  severity: NotifSeverity;
  routed: ChannelKind[];
}

export const DEFAULT_CHANNELS: Channel[] = [
  {
    id: 'ch_email_ops',
    kind: 'email',
    label: 'treasury-ops@treasury.io',
    enabled: true,
    filter: 'all',
  },
  { id: 'ch_slack_ops', kind: 'slack', label: '#treasury-ops', enabled: true, filter: 'all' },
  {
    id: 'ch_slack_sec',
    kind: 'slack',
    label: '#security-alerts',
    enabled: true,
    filter: 'critical',
  },
  { id: 'ch_pd', kind: 'pagerduty', label: 'Treasury on-call', enabled: true, filter: 'critical' },
  {
    id: 'ch_wh',
    kind: 'webhook',
    label: 'https://hooks.acme.io/treasury',
    enabled: false,
    filter: 'all',
  },
];

export const EVENT_KINDS: EventKind[] = [
  {
    id: 'multisig.pending',
    label: 'Multisig pending signature',
    severity: 'warn',
    routed: ['email', 'slack', 'pagerduty'],
  },
  {
    id: 'withdrawal.executed',
    label: 'Withdrawal executed',
    severity: 'info',
    routed: ['email', 'slack'],
  },
  {
    id: 'withdrawal.failed',
    label: 'Withdrawal failed on-chain',
    severity: 'err',
    routed: ['email', 'slack', 'pagerduty'],
  },
  { id: 'sweep.completed', label: 'Sweep batch completed', severity: 'info', routed: ['slack'] },
  {
    id: 'sweep.partial',
    label: 'Sweep batch partial failure',
    severity: 'warn',
    routed: ['email', 'slack'],
  },
  {
    id: 'recon.drift',
    label: 'Reconciliation drift > $100',
    severity: 'err',
    routed: ['email', 'slack', 'pagerduty'],
  },
  { id: 'rpc.failover', label: 'RPC primary failover', severity: 'warn', routed: ['slack'] },
  {
    id: 'signer.change',
    label: 'Signer change proposed',
    severity: 'warn',
    routed: ['email', 'slack'],
  },
];
