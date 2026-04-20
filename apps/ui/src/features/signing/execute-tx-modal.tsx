// Execute transaction modal — post-approval on-chain broadcast confirmation.
// Ported from prototype signing_modals.jsx ExecuteTxModal.
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
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
              {confirmed ? 'Transaction confirmed' : 'Broadcasting to chain…'}
            </div>
            <div className="modal-subtitle">{op.id} · threshold met</div>
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
            <div className="exec-waiting-title">Waiting for network confirmation…</div>
            <div className="exec-meta" style={{ marginTop: 18 }}>
              <div>
                <span>Network</span>
                <span>{chainName}</span>
              </div>
              <div>
                <span>Est. gas</span>
                <span className="text-mono">
                  {gasEst.native} {gasEst.label} · ~${gasEst.usd.toFixed(4)}
                </span>
              </div>
              <div>
                <span>Amount</span>
                <span className="text-mono">
                  ${fmtUSD(op.amount)} {op.token}
                </span>
              </div>
              <div>
                <span>Destination</span>
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
              Confirmed at block {broadcast.blockNumber.toLocaleString()}
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
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
