import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
// Review transaction modal — pre-sign summary + policy trace + simulation.
// Ported from prototype signing_modals.jsx ReviewTransactionModal.
import { useEffect, useState } from 'react';
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
            <div className="modal-title">Review transaction</div>
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
            <div className="review-amount-label">You're approving</div>
            <div className="review-amount-value">${fmtUSD(op.amount)}</div>
            <div className="review-amount-token">
              {op.token} · {chainName}
            </div>
          </div>
          <div className="review-arrow">
            <I.ArrowRight size={20} />
          </div>
          <div className="review-dest">
            <div className="review-dest-label">Send to</div>
            <div className="review-dest-value text-mono">{shortHash(op.destination, 10, 8)}</div>
            {op.destinationKnown ? (
              <div className="review-dest-note ok">
                <I.Check size={10} /> Previously used destination
              </div>
            ) : (
              <div className="review-dest-note warn">
                <I.AlertTri size={10} /> First-time destination
              </div>
            )}
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-head">
            <span className="section-dot sim" />
            <span className="review-section-title">Simulation</span>
            <span className="section-tag">Tenderly · dry-run</span>
          </div>
          <div className="sim-grid">
            <div className="sim-cell">
              <div className="sim-cell-label">Balance change</div>
              <div className="sim-cell-value err">-${fmtUSD(op.amount)}</div>
            </div>
            <div className="sim-cell">
              <div className="sim-cell-label">Gas for this signature</div>
              <div className="sim-cell-value">Free (off-chain)</div>
            </div>
            <div className="sim-cell">
              <div className="sim-cell-label">Signature type</div>
              <div className="sim-cell-value text-mono text-xs">{sigType}</div>
            </div>
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-head">
            <span className={`section-dot ${policy.passed ? 'ok' : 'err'}`} />
            <span className="review-section-title">Policy checks</span>
            <span className="section-tag">
              {policy.checks.filter((c) => c.ok).length} / {policy.checks.length} passed
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
            <span className="review-section-title">On-chain context</span>
          </div>
          <div className="onchain-grid">
            <div>
              <span className="text-faint text-xs">
                {op.chain === 'sol' ? 'Squads PDA' : 'Safe address'}
              </span>
              <div className="text-mono text-xs">{shortHash(op.safeAddress ?? '', 10, 8)}</div>
            </div>
            <div>
              <span className="text-faint text-xs">Nonce</span>
              <div className="text-mono text-xs">{op.nonce ?? 0}</div>
            </div>
            <div>
              <span className="text-faint text-xs">Threshold</span>
              <div className="text-mono text-xs">
                {op.signaturesRequired}/{op.totalSigners}
              </div>
            </div>
            <div>
              <span className="text-faint text-xs">Your position</span>
              <div className="text-mono text-xs">
                Signer {op.myIndex ?? 1} of {op.totalSigners}
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
          <span>I reviewed the destination, amount, and chain</span>
        </label>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onReject}>
            Reject
          </button>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${policy.passed ? 'btn-primary' : 'btn-danger'}`}
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            {policy.passed ? 'Sign in wallet' : 'Blocked by policy'}
            {policy.passed && <I.ArrowRight size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
