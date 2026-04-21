// HW attestation prompt modal — shown before wallet-sign for cold-tier withdrawals.
//
// M2 fix: Real WebHID/Ledger flow is not yet implemented. Rather than routing
// through a broken synthetic-blob path in production, the modal now:
//   - Dev-mode (VITE_AUTH_DEV_MODE=true): uses synthetic blob as before (CI/demo).
//   - Prod + HW_ATTESTATION_ENABLED=true: placeholder for real WebHID integration;
//     currently throws to prevent silent broken sign.
//   - Prod + HW_ATTESTATION_ENABLED unset/false: renders a "not yet enabled" banner
//     and blocks the cold-tier flow from proceeding — operator must see this.
//
// When WebHID integration is complete, replace the FATAL throw in the real-mode
// branch with the actual Ledger signing call.
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_DEV_MODE } from './signing-flow-broadcast';
import type { HwAttestation, SigningOp } from './signing-flow-types';

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
  onAttested: (attestation: HwAttestation) => void;
}

/** True only when running in dev-mode (CI / offline demo). */
const IS_HW_ATTESTATION_ENABLED = import.meta.env.VITE_HW_ATTESTATION_ENABLED === 'true';

function buildSyntheticBlob(withdrawalId: string): string {
  return btoa(`DEV_ATTESTATION_${withdrawalId}`);
}

export function HwPromptModal({ open, op, onClose, onAttested }: Props) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    if (!op) return;
    const withdrawalId = op.withdrawalId ?? op.id;

    if (IS_DEV_MODE) {
      // Dev-mode: synthetic blob acceptable for CI / smoke tests
      const blob = buildSyntheticBlob(withdrawalId);
      onAttested({ blob, type: 'ledger' });
      setConfirmed(false);
      return;
    }

    if (!IS_HW_ATTESTATION_ENABLED) {
      // Prod without explicit opt-in — do not proceed; operator must see this error.
      // onClose is intentionally NOT called so the parent flow stays blocked.
      console.error(
        '[hw-prompt-modal] Cold-tier HW attestation is not enabled. ' +
          'Set VITE_HW_ATTESTATION_ENABLED=true only after WebHID integration is complete.'
      );
      return;
    }

    // Production with VITE_HW_ATTESTATION_ENABLED=true:
    // Real WebHID/Ledger flow goes here. Until implemented, throw explicitly
    // rather than passing a synthetic blob that policy-engine will reject.
    throw new Error(
      '[hw-prompt-modal] Real WebHID attestation not yet implemented. ' +
        'Do not enable VITE_HW_ATTESTATION_ENABLED=true in production until ' +
        'the Ledger signing flow is complete.'
    );
  };

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <div className="spacer" />
      <button
        className="btn btn-accent"
        onClick={handleConfirm}
        disabled={!confirmed || (!IS_DEV_MODE && !IS_HW_ATTESTATION_ENABLED)}
      >
        <I.ShieldCheck size={12} /> {t('signing.hw.confirm')}
      </button>
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('signing.hw.title')}
      subtitle={t('signing.hw.subtitle')}
      footer={footer}
    >
      {IS_DEV_MODE && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('signing.hw.devModeTitle')}</div>
            <div className="alert-text">
              {t('signing.hw.devModeBody', {
                blob: op ? `DEV_ATTESTATION_${op.withdrawalId ?? op.id}` : '…',
              })}
            </div>
          </div>
        </div>
      )}

      {!IS_DEV_MODE && !IS_HW_ATTESTATION_ENABLED && (
        <div className="alert error" style={{ marginBottom: 16 }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">Hardware attestation not yet enabled</div>
            <div className="alert-text">
              Cold-tier withdrawals require hardware wallet attestation (Ledger/Trezor), which is
              not yet available in this release. Contact your administrator.
            </div>
          </div>
        </div>
      )}

      <div className="alert info" style={{ marginBottom: 16 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('signing.hw.infoTitle')}</div>
          <div className="alert-text">{t('signing.hw.infoBody')}</div>
        </div>
      </div>

      <ol style={{ paddingLeft: 20, margin: '12px 0', lineHeight: 1.8 }}>
        <li className="text-sm">{t('signing.hw.step1')}</li>
        <li className="text-sm">{t('signing.hw.step2')}</li>
        <li className="text-sm">{t('signing.hw.step3')}</li>
      </ol>

      <label className="hstack" style={{ gap: 10, marginTop: 16, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={!IS_DEV_MODE && !IS_HW_ATTESTATION_ENABLED}
        />
        <span className="text-sm">{t('signing.hw.ack')}</span>
      </label>
    </Sheet>
  );
}
