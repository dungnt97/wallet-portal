// HW attestation prompt modal — shown before wallet-sign for cold-tier withdrawals.
// Dev-mode: generates synthetic blob = base64("DEV_ATTESTATION_<withdrawalId>").
// Real-mode: same synthetic path for now (real WebHID deferred, out-of-scope per plan).
// On confirm, calls flow.hwAttested(attestation) to advance the signing flow.
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

function buildSyntheticBlob(withdrawalId: string): string {
  const raw = `DEV_ATTESTATION_${withdrawalId}`;
  return btoa(raw);
}

export function HwPromptModal({ open, op, onClose, onAttested }: Props) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    if (!op) return;
    const withdrawalId = op.withdrawalId ?? op.id;

    // Both dev-mode and real-mode use synthetic blob for now.
    // Real WebHID integration is deferred (out of scope per plan).
    const blob = buildSyntheticBlob(withdrawalId);
    onAttested({ blob, type: 'ledger' });
    setConfirmed(false);
  };

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <div className="spacer" />
      <button className="btn btn-accent" onClick={handleConfirm} disabled={!confirmed}>
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
      <div className="alert info" style={{ marginBottom: 16 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('signing.hw.infoTitle')}</div>
          <div className="alert-text">{t('signing.hw.infoBody')}</div>
        </div>
      </div>

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
        />
        <span className="text-sm">{t('signing.hw.ack')}</span>
      </label>
    </Sheet>
  );
}
