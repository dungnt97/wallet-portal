import { ApiError } from '@/api/client';
import { useAddDepositToSweep } from '@/api/queries';
import { ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
import { DetailSheet, useToast } from '@/components/overlays';
// Deposit detail side-sheet — lifecycle timeline + details definition list.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtDateTime, fmtUSD } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import type { FixDeposit } from '../_shared/fixtures';
import { explorerUrl } from '../_shared/helpers';

interface Props {
  deposit: FixDeposit | null;
  onClose: () => void;
}

export function DepositSheet({ deposit, onClose }: Props) {
  const toast = useToast();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const addToSweepMutation = useAddDepositToSweep(deposit?.id ?? '');
  if (!deposit) return null;
  const d = deposit;

  return (
    <DetailSheet
      open={!!deposit}
      onClose={onClose}
      title={`Deposit ${d.id}`}
      subtitle={`${d.token} · ${CHAINS[d.chain].name}`}
      footer={
        <>
          <a
            className="btn btn-ghost"
            href={explorerUrl(d.chain, d.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            <I.External size={13} /> View explorer
          </a>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {d.status === 'credited' && (
            <button
              type="button"
              className="btn btn-accent"
              disabled={addToSweepMutation.isPending}
              onClick={() => {
                addToSweepMutation.mutate(undefined, {
                  onSuccess: () => {
                    toast('Added to sweep queue.', 'success');
                    onClose();
                  },
                  onError: (err) => {
                    const msg = err instanceof ApiError ? err.message : String(err);
                    toast(`Failed to add to sweep: ${msg}`, 'error');
                  },
                });
              }}
            >
              {addToSweepMutation.isPending ? '…' : 'Add to sweep'}
            </button>
          )}
        </>
      }
    >
      <div
        className="hstack"
        style={{ marginBottom: 20, justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <div className="text-xs text-muted">Amount</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}
          >
            {fmtUSD(d.amount)} <span className="text-muted text-sm fw-500">{d.token}</span>
          </div>
          <div className="text-xs text-muted text-mono" style={{ marginTop: 2 }}>
            ≈ ${fmtUSD(d.amount)} USD
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>

      <h4 className="section-head">Lifecycle</h4>
      <div className="timeline" style={{ marginBottom: 20 }}>
        <div className="timeline-item">
          <div className="timeline-dot ok" />
          <div className="timeline-content">
            <div className="timeline-title">Detected on chain</div>
            <div className="timeline-meta">
              block {d.blockNumber.toLocaleString()} · {fmtDateTime(d.detectedAt)}
            </div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.status === 'pending' ? 'pending' : 'ok'}`} />
          <div className="timeline-content">
            <div className="timeline-title">
              {d.confirmations} / {d.requiredConfirmations} confirmations
            </div>
            <div className="timeline-meta">
              {d.status === 'pending' ? 'awaiting finality' : 'finalized'}
            </div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.creditedAt ? 'ok' : ''}`} />
          <div className="timeline-content">
            <div className="timeline-title">Credited to user</div>
            <div className="timeline-meta">{d.creditedAt ? fmtDateTime(d.creditedAt) : '—'}</div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.sweptAt ? 'ok' : ''}`} />
          <div className="timeline-content">
            <div className="timeline-title">Swept to hot wallet</div>
            <div className="timeline-meta">
              {d.sweptAt ? fmtDateTime(d.sweptAt) : 'awaiting sweep'}
            </div>
          </div>
        </div>
      </div>

      <h4 className="section-head">Details</h4>
      <dl className="dl">
        <dt>Deposit ID</dt>
        <dd className="text-mono">{d.id}</dd>
        <dt>User</dt>
        <dd>
          {d.userName} <span className="text-faint text-mono text-xs">{d.userId}</span>
        </dd>
        <dt>Chain</dt>
        <dd>
          <ChainPill chain={d.chain} /> {CHAINS[d.chain].name}
        </dd>
        <dt>Asset</dt>
        <dd>
          <TokenPill token={d.token} />
        </dd>
        <dt>To address</dt>
        <dd className="text-mono text-xs">{d.address}</dd>
        <dt>Tx hash</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {d.txHash}
        </dd>
        <dt>Block</dt>
        <dd className="text-mono">{d.blockNumber.toLocaleString()}</dd>
        {showRiskFlags && (
          <>
            <dt>Risk</dt>
            <dd>
              <Risk level={d.risk} />
            </dd>
          </>
        )}
      </dl>
    </DetailSheet>
  );
}
