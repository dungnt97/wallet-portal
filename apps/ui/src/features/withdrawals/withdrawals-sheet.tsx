import { useAuth } from '@/auth/use-auth';
import { ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
import { Sheet, useToast } from '@/components/overlays';
// Withdrawal detail sheet — amount header, approval queue, details list, action footer.
// Signing modals are stubbed here (toast only); full flow ships in Pass 4.
import { I } from '@/icons';
import { CHAINS, ROLES } from '@/lib/constants';
import { fmtDateTime, fmtUSD, shortHash } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { type FixWithdrawal, TREASURERS } from '../_shared/fixtures';
import { ApprovalQueue } from './approval-queue';

interface Props {
  withdrawal: FixWithdrawal | null;
  onClose: () => void;
  onApprove: (w: FixWithdrawal) => void;
  onReject: (w: FixWithdrawal) => void;
  onExecute: (w: FixWithdrawal) => void;
  onSubmitDraft: (w: FixWithdrawal) => void;
}

export function WithdrawalSheet({
  withdrawal,
  onClose,
  onApprove,
  onReject,
  onExecute,
  onSubmitDraft,
}: Props) {
  const { staff, hasPerm } = useAuth();
  const toast = useToast();
  const canApprove = hasPerm('withdrawal.approve');
  const canExecute = hasPerm('withdrawal.execute');
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  if (!withdrawal) return null;
  const w = withdrawal;
  const requester = TREASURERS.find((s) => s.id === w.requestedBy);
  const alreadyApproved = staff && w.multisig.approvers.some((a) => a.staffId === staff.id);

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        Close
      </button>
      <div className="spacer" />
      {w.stage === 'draft' && (
        <button className="btn btn-accent" onClick={() => onSubmitDraft(w)}>
          Submit to multisig
        </button>
      )}
      {w.stage === 'awaiting_signatures' && canApprove && !alreadyApproved && (
        <>
          <button
            className="btn btn-ghost"
            onClick={() => onReject(w)}
            style={{ color: 'var(--err-text)' }}
          >
            <I.UserX size={12} /> Reject
          </button>
          <button className="btn btn-accent" onClick={() => onApprove(w)}>
            <I.ShieldCheck size={12} /> Approve & sign
          </button>
        </>
      )}
      {w.stage === 'executing' && canExecute && (
        <button
          className="btn btn-primary"
          onClick={() => {
            onExecute(w);
            toast('Broadcasting (stub).', 'success');
          }}
        >
          <I.Send size={11} /> Execute on-chain
        </button>
      )}
      {w.stage === 'awaiting_signatures' && canApprove && alreadyApproved && (
        <span className="approved-stamp">
          <I.Check size={10} /> you signed
        </span>
      )}
      {w.stage === 'awaiting_signatures' && staff && !canApprove && (
        <button className="btn btn-secondary" disabled>
          <I.Lock size={12} /> Treasurers only
        </button>
      )}
    </>
  );

  return (
    <Sheet
      open={!!withdrawal}
      onClose={onClose}
      wide
      title={`Withdrawal ${w.id}`}
      subtitle={`${fmtUSD(w.amount)} ${w.token} on ${CHAINS[w.chain].name}`}
      footer={footer}
    >
      <div style={{ marginBottom: 20 }}>
        <div className="text-xs text-muted">Amount</div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtUSD(w.amount)} <span className="text-muted text-sm fw-500">{w.token}</span>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
          to <span className="text-mono">{shortHash(w.destination, 10, 8)}</span> ·{' '}
          {CHAINS[w.chain].name}
        </div>
      </div>

      <ApprovalQueue
        multisig={w.multisig}
        stage={w.stage}
        chain={w.chain}
        currentStaffId={staff?.id}
      />

      <h4 className="section-head">Details</h4>
      <dl className="dl">
        <dt>ID</dt>
        <dd className="text-mono">{w.id}</dd>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={w.stage} />
        </dd>
        <dt>Vault</dt>
        <dd>{w.chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault'}</dd>
        <dt>Chain</dt>
        <dd>
          <ChainPill chain={w.chain} /> {CHAINS[w.chain].name}
        </dd>
        <dt>Asset</dt>
        <dd>
          <TokenPill token={w.token} />
        </dd>
        <dt>Destination</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {w.destination}
        </dd>
        <dt>Requested by</dt>
        <dd className="hstack">
          {requester?.name || '—'}
          {requester && (
            <span className={`role-pill role-${requester.role}`}>
              {ROLES[requester.role]?.label}
            </span>
          )}
        </dd>
        <dt>Created</dt>
        <dd>{fmtDateTime(w.createdAt)}</dd>
        {w.txHash && (
          <>
            <dt>Tx hash</dt>
            <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
              {w.txHash}
            </dd>
          </>
        )}
        {showRiskFlags && (
          <>
            <dt>Risk</dt>
            <dd>
              <Risk level={w.risk} />
            </dd>
          </>
        )}
        {w.note && (
          <>
            <dt>Memo</dt>
            <dd>{w.note}</dd>
          </>
        )}
      </dl>
    </Sheet>
  );
}
