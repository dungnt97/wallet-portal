import { useAuth } from '@/auth/use-auth';
import { DetailSheet } from '@/components/overlays';
// Multisig op detail sheet — reuses ApprovalQueue + shows calldata preview.
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { ApprovalQueue } from '../withdrawals/approval-queue';
import type { MultisigOpDisplay } from './multisig-types';

type Op = MultisigOpDisplay;

interface Props {
  op: Op | null;
  onClose: () => void;
  onApprove: (o: Op) => void;
  onReject: (o: Op) => void;
  onExecute: (o: Op) => void;
}

export function MultisigSheet({ op, onClose, onApprove, onReject, onExecute }: Props) {
  const { staff } = useAuth();
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
        <button className="btn btn-primary" onClick={() => onExecute(op)}>
          <I.Send size={11} /> Execute on-chain
        </button>
      )}
    </>
  );

  // Calldata: show actual multisig op fields — destination, nonce, token, amounts.
  // Token contract addresses are populated from env or shown as unknown if not available.
  const bnbUsdtContract = import.meta.env.VITE_BNB_USDT_CONTRACT as string | undefined;
  const bnbUsdcContract = import.meta.env.VITE_BNB_USDC_CONTRACT as string | undefined;

  let contractAddr = '(token contract — see vault config)';
  if (op.chain === 'bnb' && op.token === 'USDT' && bnbUsdtContract) contractAddr = bnbUsdtContract;
  else if (op.chain === 'bnb' && op.token === 'USDC' && bnbUsdcContract)
    contractAddr = bnbUsdcContract;

  const calldata =
    op.token && op.destination
      ? `{
  "multisigAddr": "${op.multisigAddr}",
  "destination":  "${op.destination}",
  "token":        "${op.token ?? 'N/A'}",
  "tokenContract":"${contractAddr}",
  "amount":       "${op.amount > 0 ? op.amount : 'see on-chain payload'}",
  "nonce":        ${op.nonce},
  "operationType":"${op.operationType}",
  "chain":        "${op.chain}"
}`
      : `{
  "multisigAddr": "${op.multisigAddr}",
  "operationType":"${op.operationType}",
  "chain":        "${op.chain}",
  "nonce":        ${op.nonce}
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
