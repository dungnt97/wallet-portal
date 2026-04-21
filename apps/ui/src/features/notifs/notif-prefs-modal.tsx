import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
// Notification preferences modal — per-channel + per-event-type toggles.
// Opened from user-menu "Notification settings" item.
import type { NotificationPrefs } from '@wp/shared-types';
import { useTranslation } from 'react-i18next';
import { useNotificationPrefs, usePatchNotificationPrefs } from './use-notifications';

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer' }}
      />
    </label>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

type EventTypeKey = keyof NotificationPrefs['eventTypes'];

const EVENT_TYPE_KEYS: EventTypeKey[] = [
  'withdrawal',
  'sweep',
  'deposit',
  'killSwitch',
  'reorg',
  'health',
  'coldTimelock',
];

export function NotifPrefsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const { data: prefs, isLoading } = useNotificationPrefs();
  const patch = usePatchNotificationPrefs();

  const handleChannelToggle = (channel: 'inApp' | 'email' | 'slack', value: boolean) => {
    patch.mutate(
      { [channel]: value },
      {
        onSuccess: () => toast(t('notifications.prefs.saved'), 'success'),
      }
    );
  };

  const handleEventTypeToggle = (key: EventTypeKey, value: boolean) => {
    patch.mutate(
      { eventTypes: { [key]: value } },
      {
        onSuccess: () => toast(t('notifications.prefs.saved'), 'success'),
      }
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('notifications.prefs.title')}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('common.close')}
        </button>
      }
    >
      {isLoading || !prefs ? (
        <div className="text-sm text-muted">{t('common.loading')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Channel toggles */}
          <section>
            <div className="text-xs fw-600 text-muted" style={{ marginBottom: 4 }}>
              {t('notifications.prefs.channels')}
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <ToggleRow
                label={t('notifications.prefs.inApp')}
                checked={prefs.inApp}
                onChange={(v) => handleChannelToggle('inApp', v)}
              />
              <ToggleRow
                label={t('notifications.prefs.email')}
                checked={prefs.email}
                onChange={(v) => handleChannelToggle('email', v)}
              />
              <ToggleRow
                label={t('notifications.prefs.slack')}
                checked={prefs.slack}
                onChange={(v) => handleChannelToggle('slack', v)}
              />
            </div>
          </section>

          {/* Event-type toggles */}
          <section>
            <div className="text-xs fw-600 text-muted" style={{ marginBottom: 4 }}>
              {t('notifications.prefs.eventTypes')}
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {EVENT_TYPE_KEYS.map((key) => (
                <ToggleRow
                  key={key}
                  label={t(`notifications.eventTypes.${key}`)}
                  checked={prefs.eventTypes[key]}
                  onChange={(v) => handleEventTypeToggle(key, v)}
                />
              ))}
            </div>
          </section>

          {patch.isError && (
            <div className="text-xs" style={{ color: 'var(--err-text)' }}>
              {t('common.error')}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
