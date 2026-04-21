import { api } from '@/api/client';
import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
import { useMutation } from '@tanstack/react-query';
// Notification preferences modal — per-channel + per-event-type toggles.
// Opened from user-menu "Notification settings" item.
// Phase 11: SMS toggle + phone number input (PATCH /staff/me to save phoneNumber).
import type { NotificationPrefs } from '@wp/shared-types';
import { useState } from 'react';
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

function useSavePhone() {
  return useMutation({
    mutationFn: (phoneNumber: string) => api.patch('/staff/me', { phoneNumber }),
  });
}

export function NotifPrefsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const { data: prefs, isLoading } = useNotificationPrefs();
  const patch = usePatchNotificationPrefs();
  const savePhone = useSavePhone();

  const [phone, setPhone] = useState('');

  const handleChannelToggle = (channel: 'inApp' | 'email' | 'slack' | 'sms', value: boolean) => {
    patch.mutate(
      { [channel]: value },
      {
        onSuccess: () => toast(t('notifications.prefs.saved'), 'success'),
      }
    );
  };

  const handleSavePhone = () => {
    if (!phone.trim()) return;
    savePhone.mutate(phone.trim(), {
      onSuccess: () => toast(t('notifications.prefs.saved'), 'success'),
      onError: (err) => toast((err as Error).message ?? t('common.error'), 'error'),
    });
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
              <ToggleRow
                label={t('notifications.prefs.sms')}
                checked={prefs.sms ?? false}
                onChange={(v) => handleChannelToggle('sms', v)}
              />
            </div>
          </section>

          {/* Phone number for SMS (only shown when sms is toggled on) */}
          {(prefs.sms ?? false) && (
            <section>
              <div className="text-xs fw-600 text-muted" style={{ marginBottom: 8 }}>
                {t('notifications.prefs.phoneNumber')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('notifications.prefs.phoneNumberPlaceholder')}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSavePhone}
                  disabled={!phone.trim() || savePhone.isPending}
                >
                  {t('common.save')}
                </button>
              </div>
            </section>
          )}

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
