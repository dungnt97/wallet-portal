import { Modal } from '@/components/overlays';
// Sweep execution confirm modal — signed & broadcast dialogue.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtUSD } from '@/lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  executing: boolean;
  chain: 'bnb' | 'sol';
  addressesCount: number;
  totalUSDT: number;
  totalUSDC: number;
  total: number;
  estFee: number;
  onConfirm: () => void;
}

export function SweepConfirmModal({
  open,
  onClose,
  executing,
  chain,
  addressesCount,
  totalUSDT,
  totalUSDC,
  total,
  estFee,
  onConfirm,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={() => !executing && onClose()}
      title="Confirm sweep batch"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={executing}>
            Cancel
          </button>
          <button className="btn btn-accent" onClick={onConfirm} disabled={executing}>
            {executing ? (
              <>
                Executing… <I.Refresh size={12} style={{ animation: 'spin 1s linear infinite' }} />
              </>
            ) : (
              <>Sign &amp; broadcast ({addressesCount})</>
            )}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted" style={{ marginTop: 0 }}>
        Sweep{' '}
        <strong className="text-mono" style={{ color: 'var(--text)' }}>
          ${fmtUSD(total)}
        </strong>{' '}
        from {addressesCount} addresses on {CHAINS[chain].name}.
      </p>
      <div
        className="card"
        style={{
          background: 'var(--bg-sunken)',
          border: '1px solid var(--line)',
          marginBottom: 16,
        }}
      >
        <div style={{ padding: 16 }}>
          <dl className="dl">
            <dt>Destination</dt>
            <dd className="text-mono text-xs">
              {chain === 'bnb' ? 'BSC hot wallet 0x71C…' : 'Solana hot wallet 8Hk…'}
            </dd>
            <dt>Addresses</dt>
            <dd>{addressesCount}</dd>
            <dt>USDT</dt>
            <dd>${fmtUSD(totalUSDT)}</dd>
            <dt>USDC</dt>
            <dd>${fmtUSD(totalUSDC)}</dd>
            <dt>Network fee</dt>
            <dd>
              {estFee.toFixed(chain === 'bnb' ? 4 : 6)} {chain === 'bnb' ? 'BNB' : 'SOL'}
            </dd>
            <dt>Idempotency key</dt>
            <dd className="text-mono text-xs">sweep_{Date.now().toString(36)}</dd>
          </dl>
        </div>
      </div>
      <div className="alert warn">
        <I.AlertTri size={14} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">Irreversible</div>
          <div className="alert-text">On-chain transfer — once broadcast, cannot be cancelled.</div>
        </div>
      </div>
    </Modal>
  );
}
