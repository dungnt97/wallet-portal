// Notifications routing page — channels + event→channel matrix.
// Ports prototype page_ops_extras.jsx PageNotifs.
import { PageFrame, Toggle } from '@/components/custody';
import { Modal, useToast } from '@/components/overlays';
import { I, type IconKey } from '@/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Channel, type ChannelKind, DEFAULT_CHANNELS, EVENT_KINDS } from '../_shared/fixtures';

const CHANNEL_ICON: Record<ChannelKind, IconKey> = {
  email: 'External',
  slack: 'Bell',
  pagerduty: 'AlertTri',
  webhook: 'Link',
};

export function NotifsPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [testOpen, setTestOpen] = useState(false);
  const toast = useToast();

  const toggle = (id: string) =>
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));

  return (
    <PageFrame
      eyebrow={
        <>
          System · <span className="env-inline">{t('notifs.subtitle')}</span>
        </>
      }
      title={t('notifs.title')}
      policyStrip={
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
      }
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => setTestOpen(true)}>
            <I.Zap size={12} /> Send test
          </button>
          <button className="btn btn-accent" onClick={() => toast('Channel saved', 'success')}>
            <I.Plus size={13} /> Add channel
          </button>
        </>
      }
    >
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
            <button type="button" className="btn btn-ghost" onClick={() => setTestOpen(false)}>
              Cancel
            </button>
            <div className="spacer" />
            <button
              type="button"
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
    </PageFrame>
  );
}
