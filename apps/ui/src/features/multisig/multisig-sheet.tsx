import { useAuth } from '@/auth/use-auth';
import { DetailSheet, useToast } from '@/components/overlays';
// Multisig op detail sheet — reuses ApprovalQueue + shows calldata preview.
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import type { FIX_MULTISIG_OPS } from '../_shared/fixtures';
import { ApprovalQueue } from '../withdrawals/approval-queue';

type Op = (typeof FIX_MULTISIG_OPS)[number];

interface Props {
  op: Op | null;
  onClose: () => void;
  onApprove: (o: Op) => void;
  onReject: (o: Op) => void;
  onExecute: (o: Op) => void;
}

export function MultisigSheet({ op, onClose, onApprove, onReject, onExecute }: Props) {
  const { staff } = useAuth();
  const toast = useToast();
  if (!op) return null;

  const alreadySigned = staff && op.approvers.some((a) => a.staffId === staff.id);
  const chainLabel = op.chain === 'sol' ? 'Solana' : 'BNB Chain';

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        Close
      </button>
      <div className="spacer" />
      {op.status === 'collecting' && staff?.role === 'treasurer' && !alreadySigned && (
        <>
          <button
            className="btn btn-ghost"
            onClick={() => onReject(op)}
            style={{ color: 'var(--err-text)' }}
          >
            <I.UserX size={12} /> Reject
          </button>
          <button className="btn btn-accent" onClick={() => onApprove(op)}>
            <I.ShieldCheck size={12} /> Approve & sign
          </button>
        </>
      )}
      {op.status === 'collecting' && staff?.role === 'treasurer' && alreadySigned && (
        <span className="approved-stamp">
          <I.Check size={10} /> you signed
        </span>
      )}
      {op.status === 'collecting' && staff && staff.role !== 'treasurer' && (
        <button className="btn btn-secondary" disabled>
          <I.Lock size={12} /> Treasurers only
        </button>
      )}
      {op.status === 'ready' && (
        <button
          className="btn btn-primary"
          onClick={() => {
            onExecute(op);
            toast('Broadcasting (stub).', 'success');
          }}
        >
          <I.Send size={11} /> Execute on-chain
        </button>
      )}
    </>
  );

  const calldata = `{
  "to":     "${op.token === 'USDT' ? '0x55d398326f99059fF775485246999027B3197955' : '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'}",
  "value":  "0",
  "data":   "0xa9059cbb000000000000000000000000${op.destination.slice(2, 42)}…",
  "operation": 0,
  "safeTxGas": 80000,
  "nonce":  ${op.nonce}
}`;

  return (
    <DetailSheet
      open={!!op}
      onClose={onClose}
      wide
      title={`Multisig ${op.id}`}
      subtitle={`${op.safeName} · nonce ${op.nonce}`}
      footer={footer}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <div className="text-xs text-muted">Amount</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}
          >
            {fmtUSD(op.amount)} <span className="text-muted text-sm fw-500">{op.token}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Destination · {chainLabel}</div>
          <div className="text-mono text-sm" style={{ marginTop: 6, wordBreak: 'break-all' }}>
            {shortHash(op.destination, 12, 8)}
          </div>
        </div>
      </div>

      <ApprovalQueue
        multisig={{
          required: op.required,
          total: op.total,
          collected: op.collected,
          approvers: op.approvers,
          rejectedBy: op.rejectedBy,
        }}
        stage={
          op.status === 'collecting'
            ? 'awaiting_signatures'
            : op.status === 'ready'
              ? 'executing'
              : 'failed'
        }
        chain={op.chain}
        currentStaffId={staff?.id}
      />

      <h4 className="section-head">Calldata</h4>
      <pre className="code" style={{ maxHeight: 180, overflow: 'auto' }}>
        {calldata}
      </pre>
    </DetailSheet>
  );
}
