// KillSwitchCard — big red toggle with status banner.
// Shows OUTBOUND PAUSED banner when kill-switch is enabled.
// Opens ConfirmToggleModal to capture reason before firing POST /ops/kill-switch.
import { useKillSwitch, useToggleKillSwitch } from '@/api/queries';
import { Toggle } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmToggleModal } from './confirm-toggle-modal';

export function KillSwitchCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, isLoading } = useKillSwitch();
  const toggleMutation = useToggleKillSwitch();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState(false);

  const enabled = data?.enabled ?? false;

  const handleToggleClick = (next: boolean) => {
    setPendingEnabled(next);
    setModalOpen(true);
  };

  const handleConfirm = (reason: string) => {
    setModalOpen(false);
    toggleMutation.mutate(
      { enabled: pendingEnabled, reason: reason || undefined },
      {
        onError: (err) => {
          toast(t('ops.killSwitch.toggleError', { msg: String(err) }), 'error');
        },
      }
    );
  };

  const handleCancel = () => {
    setModalOpen(false);
  };

  return (
    <>
      {enabled && (
        <div
          className="policy-strip"
          style={{
            background: 'var(--c-red)',
            color: '#fff',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textAlign: 'center',
            padding: '10px 0',
          }}
        >
          {t('ops.killSwitch.banner')}
        </div>
      )}

      <div className="card" style={{ padding: '20px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>
              {t('ops.killSwitch.cardTitle')}
            </div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              {enabled
                ? t('ops.killSwitch.descEnabled', { reason: data?.reason ?? '—' })
                : t('ops.killSwitch.descDisabled')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: enabled ? 'var(--c-red)' : 'var(--c-green)',
              }}
            >
              {enabled ? t('ops.killSwitch.statusOn') : t('ops.killSwitch.statusOff')}
            </span>
            {isLoading ? (
              <div className="spinner" style={{ width: 36, height: 20 }} />
            ) : (
              <Toggle on={enabled} onChange={handleToggleClick} />
            )}
          </div>
        </div>

        {data?.updatedAt && (
          <div className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>
            {t('ops.killSwitch.lastUpdated', {
              ts: new Date(data.updatedAt).toLocaleString(),
            })}
          </div>
        )}
      </div>

      <ConfirmToggleModal
        open={modalOpen}
        targetEnabled={pendingEnabled}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
