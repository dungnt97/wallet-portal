// Execute transaction modal — post-approval on-chain broadcast confirmation.
// Ported from prototype signing_modals.jsx ExecuteTxModal.
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { explorerUrl } from '../_shared/helpers';
import type { BroadcastResult, SigningOp } from './signing-flow';

interface Props {
  open: boolean;
  op: SigningOp | null;
  /** null while broadcasting, populated on confirmation. */
  broadcast: BroadcastResult | null;
  onClose: () => void;
}

export function ExecuteTxModal({ open, op, broadcast, onClose }: Props) {
  const { t } = useTranslation();

  if (!open || !op) return null;

  const chainName = op.chain === 'sol' ? 'Solana Mainnet' : 'BNB Smart Chain';
  const gasEst =
    op.chain === 'sol'
      ? { native: 0.000005, usd: 0.0012, label: 'SOL' }
      : { native: 0.00042, usd: 0.14, label: 'BNB' };

  const confirmed = !!broadcast;

  return (
    <div className="modal-scrim" onClick={confirmed ? onClose : undefined}>
      <div
        className="modal execute-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {confirmed ? t('signing.txConfirmed') : t('signing.broadcasting')}
            </div>
            <div className="modal-subtitle">
              {op.id} · {t('signing.thresholdMet')}
            </div>
          </div>
          {confirmed && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <I.X size={14} />
            </button>
          )}
        </div>

        {!confirmed && (
          <div className="exec-waiting">
            <div className="exec-waiting-spinner">
              <I.Loader size={44} />
            </div>
            <div className="exec-waiting-title">{t('signing.waitingNetwork')}</div>
            <div className="exec-meta" style={{ marginTop: 18 }}>
              <div>
                <span>{t('signing.network')}</span>
                <span>{chainName}</span>
              </div>
              <div>
                <span>{t('signing.estGas')}</span>
                <span className="text-mono">
                  {gasEst.native} {gasEst.label} · ~${gasEst.usd.toFixed(4)}
                </span>
              </div>
              <div>
                <span>{t('signing.amount')}</span>
                <span className="text-mono">
                  ${fmtUSD(op.amount)} {op.token}
                </span>
              </div>
              <div>
                <span>{t('signing.destination')}</span>
                <span className="text-mono text-xs">{shortHash(op.destination, 10, 8)}</span>
              </div>
            </div>
          </div>
        )}

        {confirmed && broadcast && (
          <div className="exec-confirmed">
            <div className="exec-confirmed-check">
              <I.Check size={36} />
            </div>
            <div className="exec-confirmed-title">
              {t('signing.confirmedAtBlock', { number: broadcast.blockNumber.toLocaleString() })}
            </div>
            <a
              className="exec-confirmed-hash text-mono text-xs"
              href={explorerUrl(op.chain, broadcast.hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {broadcast.hash.slice(0, 18)}… <I.External size={10} />
            </a>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={onClose}>
                {t('signing.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
