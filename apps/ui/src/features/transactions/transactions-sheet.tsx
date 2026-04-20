// Transaction detail sheet — slides in with full tx info + explorer link.
import { ChainPill, StatusBadge, TokenPill } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import type { FixTransaction } from '../_shared/fixtures';
import { explorerUrl } from '../_shared/helpers';

interface Props {
  tx: FixTransaction | null;
  onClose: () => void;
}

export function TransactionSheet({ tx, onClose }: Props) {
  if (!tx) return null;
  return (
    <Sheet
      open={!!tx}
      onClose={onClose}
      title={`Transaction ${tx.id}`}
      subtitle={`${tx.type} · ${CHAINS[tx.chain].short}`}
      footer={
        <>
          <a
            className="btn btn-ghost"
            href={explorerUrl(tx.chain, tx.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            <I.External size={13} /> View on explorer
          </a>
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <dl className="dl">
        <dt>Type</dt>
        <dd style={{ textTransform: 'capitalize' }}>{tx.type}</dd>
        <dt>Chain</dt>
        <dd>
          <ChainPill chain={tx.chain} />
        </dd>
        <dt>Asset</dt>
        <dd>
          <TokenPill token={tx.token} amount={tx.amount} />
        </dd>
        <dt>From</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {tx.from}
        </dd>
        <dt>To</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {tx.to}
        </dd>
        <dt>Hash</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {tx.txHash}
        </dd>
        <dt>Block</dt>
        <dd className="text-mono">{tx.blockNumber.toLocaleString()}</dd>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={tx.status} />
        </dd>
        <dt>Fee</dt>
        <dd className="text-mono">
          {tx.fee.toFixed(tx.chain === 'bnb' ? 4 : 6)} {tx.chain === 'bnb' ? 'BNB' : 'SOL'}
        </dd>
        <dt>Time</dt>
        <dd>{fmtDateTime(tx.timestamp)}</dd>
      </dl>
    </Sheet>
  );
}
