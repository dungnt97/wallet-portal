import { Toggle } from '@/components/custody';
import { Modal, useToast } from '@/components/overlays';
import { I, type IconKey } from '@/icons';
// Notifications routing page — channels + event→channel matrix.
// Ports prototype page_ops_extras.jsx PageNotifs.
import { useState } from 'react';

type Severity = 'info' | 'warn' | 'err';
type ChannelKind = 'email' | 'slack' | 'pagerduty' | 'webhook';

interface Channel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  filter: string;
}

interface EventKind {
  id: string;
  label: string;
  severity: Severity;
  routed: ChannelKind[];
}

const DEFAULT_CHANNELS: Channel[] = [
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

const EVENT_KINDS: EventKind[] = [
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

const CHANNEL_ICON: Record<ChannelKind, IconKey> = {
  email: 'External',
  slack: 'Bell',
  pagerduty: 'AlertTri',
  webhook: 'Link',
};

export function NotifsPage() {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [testOpen, setTestOpen] = useState(false);
  const toast = useToast();

  const toggle = (id: string) =>
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Bell size={11} />
          <span className="text-muted">Channels:</span>
          <span className="fw-600">{channels.filter((c) => c.enabled).length} active</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Activity size={11} />
          <span className="text-muted">Delivered 24h:</span>
          <span className="fw-600">142</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.AlertTri size={11} />
          <span className="text-muted">Failed 24h:</span>
          <span className="fw-600" style={{ color: 'var(--err-text)' }}>
            1
          </span>
        </div>
        <div className="spacer" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            System · <span className="env-inline">Alert routing</span>
          </div>
          <h1 className="page-title">Notifications</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setTestOpen(true)}>
            <I.Zap size={12} /> Send test
          </button>
          <button className="btn btn-accent" onClick={() => toast('Channel saved', 'success')}>
            <I.Plus size={13} /> Add channel
          </button>
        </div>
      </div>

      <div className="notif-routing-grid" style={{ marginTop: 14 }}>
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">Channels</h3>
          </div>
          <div style={{ padding: 4 }}>
            {channels.map((c) => {
              const Icon = I[CHANNEL_ICON[c.kind]];
              return (
                <div key={c.id} className="ch-row">
                  <div className={`ch-kind ch-kind-${c.kind}`}>
                    <Icon size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fw-500 text-sm">{c.label}</div>
                    <div className="text-xs text-muted">
                      {c.kind} · filter:{' '}
                      {c.filter === 'all' ? 'all events' : `severity ≥ ${c.filter}`}
                    </div>
                  </div>
                  <Toggle on={c.enabled} onChange={() => toggle(c.id)} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">Event routing matrix</h3>
            <div className="spacer" />
            <span className="text-xs text-muted">Which events fire which channels</span>
          </div>
          <table className="table table-tight">
            <thead>
              <tr>
                <th>Event</th>
                <th>Severity</th>
                <th>Email</th>
                <th>Slack</th>
                <th>PagerDuty</th>
                <th>Webhook</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_KINDS.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="text-sm fw-500">{e.label}</div>
                    <div className="text-xs text-muted text-mono">{e.id}</div>
                  </td>
                  <td>
                    <span className={`badge-tight ${e.severity}`}>{e.severity}</span>
                  </td>
                  {(['email', 'slack', 'pagerduty', 'webhook'] as ChannelKind[]).map((k) => (
                    <td key={k}>
                      {e.routed.includes(k) ? (
                        <I.Check size={12} style={{ color: 'var(--ok-text)' }} />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Send test notification"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTestOpen(false)}>
              Cancel
            </button>
            <div className="spacer" />
            <button
              className="btn btn-accent"
              onClick={() => {
                setTestOpen(false);
                toast('Test sent to 4 active channels', 'success');
              }}
            >
              Send test
            </button>
          </>
        }
      >
        <div className="text-sm text-muted">
          This will send a sample "multisig.pending" event to every enabled channel. Recipients will
          see a <strong>[TEST]</strong> banner.
        </div>
      </Modal>
    </div>
  );
}
