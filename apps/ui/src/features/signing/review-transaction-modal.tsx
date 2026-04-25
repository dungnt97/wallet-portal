import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
// Review transaction modal — pre-sign summary + policy trace + simulation.
// Ported from prototype signing_modals.jsx ReviewTransactionModal.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluatePolicy } from './policy-preview';
import type { SigningOp } from './signing-flow';

interface Props {
  open: boolean;
  op: SigningOp | null;
  onClose: () => void;
  onConfirm: () => void;
  onReject: () => void;
}

export function ReviewTransactionModal({ open, op, onClose, onConfirm, onReject }: Props) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open]);

  if (!open || !op) return null;

  const policy = evaluatePolicy(op);
  const sigType = op.chain === 'sol' ? 'Squads proposal vote' : 'EIP-712 typed message';
  const chainName = op.chain === 'sol' ? 'Solana' : 'BNB Chain';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal review-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('signing.reviewTitle')}</div>
            <div className="modal-subtitle">
              {op.id} · {op.chain === 'sol' ? 'Squads v4' : 'Safe v1.4.1'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <I.X size={14} />
          </button>
        </div>

        <div className="review-primary">
          <div className="review-amount">
            <div className="review-amount-label">{t('signing.approving')}</div>
            <div className="review-amount-value">${fmtUSD(op.amount)}</div>
            <div className="review-amount-token">
              {op.token} · {chainName}
            </div>
          </div>
          <div className="review-arrow">
            <I.ArrowRight size={20} />
          </div>
          <div className="review-dest">
            <div className="review-dest-label">{t('signing.sendTo')}</div>
            <div className="review-dest-value text-mono">{shortHash(op.destination, 10, 8)}</div>
            {op.destinationKnown ? (
              <div className="review-dest-note ok">
                <I.Check size={10} /> {t('signing.knownDest')}
              </div>
            ) : (
              <div className="review-dest-note warn">
                <I.AlertTri size={10} /> {t('signing.firstTimeDest')}
              </div>
            )}
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-head">
            <span className="section-dot sim" />
            <span className="review-section-title">{t('signing.simulation')}</span>
            <span className="section-tag">{t('signing.simTag')}</span>
          </div>
          <div className="sim-grid">
            <div className="sim-cell">
              <div className="sim-cell-label">{t('signing.simBalance')}</div>
              <div className="sim-cell-value err">-${fmtUSD(op.amount)}</div>
            </div>
            <div className="sim-cell">
              <div className="sim-cell-label">{t('signing.simGas')}</div>
              <div className="sim-cell-value">{t('signing.simGasValue')}</div>
            </div>
            <div className="sim-cell">
              <div className="sim-cell-label">{t('signing.simSigType')}</div>
              <div className="sim-cell-value text-mono text-xs">{sigType}</div>
            </div>
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-head">
            <span className={`section-dot ${policy.passed ? 'ok' : 'err'}`} />
            <span className="review-section-title">{t('signing.policyChecks')}</span>
            <span className="section-tag">
              {t('signing.policyPassed', {
                a: policy.checks.filter((c) => c.ok).length,
                b: policy.checks.length,
              })}
            </span>
          </div>
          <div className="policy-trace">
            {policy.checks.map((c) => (
              <div key={c.key} className={`policy-row ${c.ok ? 'ok' : c.warning ? 'warn' : 'err'}`}>
                <span className="policy-icon">
                  {c.ok ? (
                    <I.Check size={11} />
                  ) : c.warning ? (
                    <I.AlertTri size={11} />
                  ) : (
                    <I.Close size={11} />
                  )}
                </span>
                <span className="policy-label">{c.label}</span>
                <span className="policy-detail text-xs text-faint">{c.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-head">
            <span className="section-dot info" />
            <span className="review-section-title">{t('signing.onChainContext')}</span>
          </div>
          <div className="onchain-grid">
            <div>
              <span className="text-faint text-xs">
                {op.chain === 'sol' ? t('signing.squadsPda') : t('signing.safeAddress')}
              </span>
              <div className="text-mono text-xs">{shortHash(op.safeAddress ?? '', 10, 8)}</div>
            </div>
            <div>
              <span className="text-faint text-xs">{t('signing.nonce')}</span>
              <div className="text-mono text-xs">{op.nonce ?? 0}</div>
            </div>
            <div>
              <span className="text-faint text-xs">{t('signing.threshold')}</span>
              <div className="text-mono text-xs">
                {op.signaturesRequired}/{op.totalSigners}
              </div>
            </div>
            <div>
              <span className="text-faint text-xs">{t('signing.yourPosition')}</span>
              <div className="text-mono text-xs">
                {t('signing.signerOf', { i: op.myIndex ?? 1, n: op.totalSigners })}
              </div>
            </div>
          </div>
        </div>

        <label className="review-ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>{t('signing.ack')}</span>
        </label>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onReject}>
            {t('signing.reject')}
          </button>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            {t('signing.cancel')}
          </button>
          <button
            className={`btn ${policy.passed ? 'btn-primary' : 'btn-danger'}`}
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            {policy.passed ? t('signing.signInWallet') : t('signing.blockedByPolicy')}
            {policy.passed && <I.ArrowRight size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
