// Transactions table — rows + pagination. Extracted from transactions-page.
import { Address, ChainPill, Hash, StatusBadge, TokenPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import type { FixTransaction } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  rows: FixTransaction[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onSelect: (t: FixTransaction) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function TransactionsTable({
  rows,
  page,
  totalPages,
  total,
  pageSize,
  onSelect,
  onPrev,
  onNext,
}: Props) {
  return (
    <>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>Type</th>
            <th>Chain</th>
            <th>Asset</th>
            <th className="num">Amount</th>
            <th>From</th>
            <th>To</th>
            <th>Hash</th>
            <th className="num">Block</th>
            <th>Status</th>
            <th className="num">Fee</th>
            <th className="num">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} onClick={() => onSelect(t)} style={{ cursor: 'pointer' }}>
              <td>
                <span className="hstack gap-xs">
                  {t.type === 'deposit' && (
                    <span className="type-icon ok">
                      <I.ArrowDown size={10} />
                    </span>
                  )}
                  {t.type === 'withdrawal' && (
                    <span className="type-icon err">
                      <I.ArrowUp size={10} />
                    </span>
                  )}
                  {t.type === 'sweep' && (
                    <span className="type-icon info">
                      <I.Sweep size={10} />
                    </span>
                  )}
                  <span className="fw-500" style={{ textTransform: 'capitalize' }}>
                    {t.type}
                  </span>
                </span>
              </td>
              <td>
                <ChainPill chain={t.chain} />
              </td>
              <td>
                <TokenPill token={t.token} />
              </td>
              <td className="num text-mono fw-500">{fmtUSD(t.amount)}</td>
              <td>
                {t.from === '—' ? (
                  <span className="text-faint">—</span>
                ) : (
                  <Address value={t.from} />
                )}
              </td>
              <td>
                <Address value={t.to} />
              </td>
              <td>
                <Hash value={t.txHash} />
              </td>
              <td className="num text-mono text-xs text-muted">{t.blockNumber.toLocaleString()}</td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td className="num text-mono text-xs text-muted">
                {t.fee.toFixed(t.chain === 'bnb' ? 4 : 6)}
              </td>
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={t.timestamp} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <span>
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}{' '}
          of {total}
        </span>
        <div className="spacer" />
        <button disabled={page <= 1} onClick={onPrev}>
          <I.ChevronLeft size={12} /> Prev
        </button>
        <span>
          Page <span className="text-mono">{page}</span> of{' '}
          <span className="text-mono">{totalPages}</span>
        </span>
        <button disabled={page >= totalPages} onClick={onNext}>
          Next <I.ChevronRight size={12} />
        </button>
      </div>
    </>
  );
}
