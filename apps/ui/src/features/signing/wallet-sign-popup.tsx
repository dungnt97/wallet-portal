import { I } from '@/icons';
import { shortHash } from '@/lib/format';
// Wallet sign popup — mocks the MetaMask / Phantom / Ledger sign prompt.
// Ported from prototype signing_modals.jsx WalletSignPopup.
import { useEffect, useState } from 'react';
import { type SignedSignature, type SigningOp, mockSign } from './signing-flow';
import { type WalletKind, WalletMark } from './wallet-marks';

interface Props {
  open: boolean;
  op: SigningOp | null;
  walletKind?: WalletKind;
  onSigned: (sig: SignedSignature) => void;
  onRejected: () => void;
  onClose: () => void;
}

export function WalletSignPopup({
  open,
  op,
  walletKind = 'metamask',
  onSigned,
  onRejected,
  onClose,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'signing' | 'done'>('idle');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus('idle');
      setExpanded(false);
    }
  }, [open]);

  if (!open || !op) return null;

  const brand =
    walletKind === 'metamask'
      ? 'MetaMask'
      : walletKind === 'phantom'
        ? 'Phantom'
        : walletKind === 'ledger'
          ? 'Ledger Live'
          : 'WalletConnect';
  const chainLabel = op.chain === 'sol' ? 'Solana Mainnet' : 'BNB Smart Chain';

  const typedMessage = {
    to: op.destination,
    token: op.token,
    amount: op.amount,
    nonce: op.nonce ?? 0,
    safe: op.safeAddress,
  };

  async function sign() {
    if (!op) return;
    setStatus('signing');
    const result = await mockSign(op);
    setStatus('done');
    setTimeout(() => {
      onSigned(result);
      onClose();
    }, 480);
  }

  return (
    <div className="wallet-popup-scrim">
      <div className={`wallet-popup wallet-popup-${walletKind}`} role="dialog" aria-modal="true">
        <div className="wallet-popup-chrome">
          <WalletMark kind={walletKind} size={24} />
          <span className="wallet-popup-brand">{brand}</span>
          <span className="spacer" />
          <span className="wallet-popup-net">
            <span className="dot" />
            {chainLabel}
          </span>
        </div>

        <div className="wallet-popup-acct">
          <div
            className="wallet-popup-avatar"
            style={{
              background: `linear-gradient(135deg, #${op.safeAddress?.slice(2, 8) ?? 'a9c8e2'}, #${op.safeAddress?.slice(-6) ?? '5b7dfa'})`,
            }}
          />
          <div>
            <div className="wallet-popup-acct-name">Treasury Signer</div>
            <div className="wallet-popup-acct-addr text-mono">
              {shortHash(op.safeAddress ?? '', 8, 6)}
            </div>
          </div>
        </div>

        <div className="wallet-popup-body">
          <div className="wallet-popup-title">Signature request</div>
          <div className="wallet-popup-sub">
            Wallet-Portal is requesting a signature for a Safe transaction.{' '}
            <strong>This is off-chain</strong> — no gas, no network fee.
          </div>

          <div className="wallet-popup-data">
            <button
              type="button"
              className="wallet-popup-data-head"
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="text-xs fw-600">{op.chain === 'sol' ? 'Proposal' : 'SafeTx'}</span>
              <span className="spacer" />
              <span className="text-xs text-faint">
                Click to {expanded ? 'collapse' : 'view raw data'}
              </span>
              <I.ArrowRight
                size={11}
                style={{
                  transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
                  transition: 'transform 120ms',
                }}
              />
            </button>
            {expanded ? (
              <pre className="wallet-popup-typed">{JSON.stringify(typedMessage, null, 2)}</pre>
            ) : (
              <div className="wallet-popup-summary">
                {Object.entries(typedMessage)
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <div key={k} className="wallet-popup-sum-row">
                      <span className="wallet-popup-sum-k">{k}</span>
                      <span className="wallet-popup-sum-v text-mono text-xs">
                        {String(v).length > 30 ? shortHash(String(v), 10, 6) : String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="wallet-popup-foot">
          {status === 'idle' && (
            <>
              <button className="btn btn-ghost" onClick={onRejected}>
                Reject
              </button>
              <button className="btn btn-primary" onClick={sign}>
                Sign
              </button>
            </>
          )}
          {status === 'signing' && (
            <div className="wallet-popup-signing">
              <I.Loader size={14} />
              <span>Signing…</span>
            </div>
          )}
          {status === 'done' && (
            <div className="wallet-popup-done">
              <I.Check size={16} />
              <span>Signed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
