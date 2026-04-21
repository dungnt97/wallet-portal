// Notifications admin page — system-level channel config + event routing matrix.
// Admin-scoped: channels CRUD, routing cell toggles, send-test modal.
// Per-staff prefs live in notif-prefs-modal (separate, untouched).
import {
  type AdminChannel,
  type ChannelKind,
  type RoutingRule,
  adminNotifQueryKeys,
  useAdminChannels,
  useAdminRouting,
  useDeleteAdminChannel,
  useTestAdminChannel,
  useUpdateAdminChannel,
  useUpsertRoutingRule,
} from '@/api/queries';
import { PageFrame, Toggle } from '@/components/custody';
import { Modal, useToast } from '@/components/overlays';
import { I, type IconKey } from '@/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChannelFormModal } from './channel-form-modal';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<ChannelKind, IconKey> = {
  email: 'External',
  slack: 'Bell',
  pagerduty: 'AlertTri',
  webhook: 'Link',
};

const CHANNEL_KINDS: ChannelKind[] = ['email', 'slack', 'pagerduty', 'webhook'];

// Known event types for the test modal selector
const TEST_EVENT_TYPES = [
  'withdrawal.created',
  'withdrawal.approved',
  'withdrawal.executed',
  'deposit.credited',
  'sweep.completed',
  'multisig.threshold_met',
  'signer.key_rotated',
  'killswitch.enabled',
];

// ── Routing matrix cell ───────────────────────────────────────────────────────

interface RoutingCellProps {
  eventType: string;
  severity: string;
  channelKind: ChannelKind;
  rules: RoutingRule[];
}

function RoutingCell({ eventType, severity, channelKind, rules }: RoutingCellProps) {
  const upsert = useUpsertRoutingRule();
  const toast = useToast();
  const { t } = useTranslation();

  const rule = rules.find((r) => r.eventType === eventType && r.channelKind === channelKind);
  // Optimistic: track pending toggle locally
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const enabled = optimistic !== null ? optimistic : (rule?.enabled ?? false);

  const handleClick = () => {
    const next = !enabled;
    setOptimistic(next);
    upsert
      .mutateAsync({
        eventType,
        severity: severity as 'info' | 'warn' | 'err',
        channelKind,
        enabled: next,
      })
      .then(() => setOptimistic(null))
      .catch(() => {
        setOptimistic(null);
        toast(t('common.error'), 'error');
      });
  };

  return (
    <td
      onClick={handleClick}
      style={{ cursor: 'pointer', textAlign: 'center', userSelect: 'none' }}
      title={enabled ? 'Click to disable' : 'Click to enable'}
    >
      {enabled ? (
        <I.Check size={12} style={{ color: 'var(--ok-text)' }} />
      ) : (
        <span className="text-faint">—</span>
      )}
    </td>
  );
}

// ── Channel row actions ───────────────────────────────────────────────────────

interface ChannelRowProps {
  channel: AdminChannel;
  onEdit: (ch: AdminChannel) => void;
}

function ChannelRow({ channel, onEdit }: ChannelRowProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const updateMut = useUpdateAdminChannel();
  const deleteMut = useDeleteAdminChannel();
  const testMut = useTestAdminChannel();
  const qc = useQueryClient();

  const handleToggle = () => {
    updateMut.mutate(
      { id: channel.id, enabled: !channel.enabled },
      {
        onSuccess: () => void qc.invalidateQueries({ queryKey: adminNotifQueryKeys.channels() }),
        onError: () => toast(t('common.error'), 'error'),
      }
    );
  };

  const handleDelete = () => {
    deleteMut.mutate(channel.id, {
      onSuccess: () => toast(t('notifs.channels.deleted'), 'success'),
      onError: () => toast(t('common.error'), 'error'),
    });
  };

  const handleTest = () => {
    testMut.mutate(channel.id, {
      onSuccess: () => toast(t('notifs.testSent'), 'success'),
      onError: () => toast(t('common.error'), 'error'),
    });
  };

  const Icon = I[CHANNEL_ICON[channel.kind]];

  return (
    <div className="ch-row">
      <div className={`ch-kind ch-kind-${channel.kind}`}>
        <Icon size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fw-500 text-sm">{channel.name}</div>
        <div className="text-xs text-muted">
          {channel.kind} · filter: severity ≥ {channel.severityFilter}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          type="button"
          className="icon-btn"
          title={t('notifs.sendTest')}
          onClick={handleTest}
          disabled={testMut.isPending}
        >
          <I.Zap size={12} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('notifs.editChannel')}
          onClick={() => onEdit(channel)}
        >
          <I.Pencil size={12} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('notifs.deleteChannel')}
          onClick={handleDelete}
          disabled={deleteMut.isPending}
          style={{ color: 'var(--err-text)' }}
        >
          <I.Trash size={12} />
        </button>
      </div>
      <Toggle on={channel.enabled} onChange={handleToggle} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function NotifsPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const { data: channelsData } = useAdminChannels();
  const { data: routingData } = useAdminRouting();
  const testMut = useTestAdminChannel();

  const channels: AdminChannel[] = channelsData?.data ?? [];
  const rules: RoutingRule[] = routingData?.data ?? [];

  // Derive unique event types + severity from rules (preserving order of first appearance)
  const eventTypeMap = new Map<string, string>();
  for (const r of rules) {
    if (!eventTypeMap.has(r.eventType)) eventTypeMap.set(r.eventType, r.severity);
  }
  const eventRows = Array.from(eventTypeMap.entries()).map(([id, severity]) => ({ id, severity }));

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<AdminChannel | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testEventType, setTestEventType] = useState(TEST_EVENT_TYPES[0]!);

  const handleSendTestAll = () => {
    const active = channels.filter((c) => c.enabled);
    if (active.length === 0) {
      toast('No active channels', 'error');
      return;
    }
    Promise.all(active.map((c) => testMut.mutateAsync(c.id)))
      .then(() => {
        setTestOpen(false);
        toast(t('notifs.testSent'), 'success');
      })
      .catch(() => toast(t('common.error'), 'error'));
  };

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
            <span className="text-muted">{t('notifs.channels.active')}:</span>
            <span className="fw-600">{channels.filter((c) => c.enabled).length}</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Activity size={11} />
            <span className="text-muted">{t('notifs.routing.rules')}:</span>
            <span className="fw-600">{rules.filter((r) => r.enabled).length}</span>
          </div>
          <div className="spacer" />
        </div>
      }
      actions={
        <>
          <button className="btn btn-secondary" onClick={() => setTestOpen(true)}>
            <I.Zap size={12} /> {t('notifs.sendTest')}
          </button>
          <button className="btn btn-accent" onClick={() => setAddOpen(true)}>
            <I.Plus size={13} /> {t('notifs.addChannel')}
          </button>
        </>
      }
    >
      <div className="notif-routing-grid" style={{ marginTop: 14 }}>
        {/* ── Channels panel ── */}
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('notifs.channels.title')}</h3>
          </div>
          <div style={{ padding: 4 }}>
            {channels.length === 0 && (
              <div className="text-sm text-muted" style={{ padding: '12px 8px' }}>
                {t('common.empty')}
              </div>
            )}
            {channels.map((c) => (
              <ChannelRow key={c.id} channel={c} onEdit={(ch) => setEditChannel(ch)} />
            ))}
          </div>
        </div>

        {/* ── Event routing matrix ── */}
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('notifs.routing.title')}</h3>
            <div className="spacer" />
            <span className="text-xs text-muted">{t('notifs.routing.hint')}</span>
          </div>
          <table className="table table-tight">
            <thead>
              <tr>
                <th>{t('notifs.routing.event')}</th>
                <th>{t('notifs.routing.severity')}</th>
                {CHANNEL_KINDS.map((k) => (
                  <th key={k} style={{ textAlign: 'center' }}>
                    {k === 'pagerduty' ? 'PD' : k.charAt(0).toUpperCase() + k.slice(1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventRows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="text-sm fw-500">
                      {e.id
                        .split('.')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </div>
                    <div className="text-xs text-muted text-mono">{e.id}</div>
                  </td>
                  <td>
                    <span className={`badge-tight ${e.severity}`}>{e.severity}</span>
                  </td>
                  {CHANNEL_KINDS.map((k) => (
                    <RoutingCell
                      key={k}
                      eventType={e.id}
                      severity={e.severity}
                      channelKind={k}
                      rules={rules}
                    />
                  ))}
                </tr>
              ))}
              {eventRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-sm text-muted"
                    style={{ textAlign: 'center', padding: 16 }}
                  >
                    {t('common.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add channel modal ── */}
      <ChannelFormModal open={addOpen} onClose={() => setAddOpen(false)} />

      {/* ── Edit channel modal ── */}
      {editChannel && (
        <ChannelFormModal
          open={!!editChannel}
          onClose={() => setEditChannel(null)}
          initialData={editChannel}
        />
      )}

      {/* ── Send test modal ── */}
      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title={t('notifs.sendTest')}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setTestOpen(false)}>
              {t('common.cancel')}
            </button>
            <div className="spacer" />
            <button
              type="button"
              className="btn btn-accent"
              onClick={handleSendTestAll}
              disabled={testMut.isPending}
            >
              <I.Zap size={12} /> {testMut.isPending ? t('common.saving') : t('notifs.sendTest')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="text-sm text-muted">
            {t('notifs.routing.testHint', {
              count: channels.filter((c) => c.enabled).length,
            })}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="test-event-select">
              {t('notifs.routing.event')}
            </label>
            <select
              id="test-event-select"
              className="input"
              value={testEventType}
              onChange={(e) => setTestEventType(e.target.value)}
              style={{ marginTop: 4 }}
            >
              {TEST_EVENT_TYPES.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </PageFrame>
  );
}
