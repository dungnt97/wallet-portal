// DepositsTable — renders paginated deposit rows with status badges and token pills
// Columns: Time, User, Chain, Token, Amount, TX Hash, Confirmed Blocks, Status
import type { Deposit } from './use-deposits';

interface Props {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}

const STATUS_CLASSES: Record<Deposit['status'], string> = {
  pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  credited: 'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400',
  swept:    'bg-[var(--bg-muted)] text-[var(--text-muted)]',
  failed:   'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-400',
};

const TOKEN_CLASSES: Record<Deposit['token'], string> = {
  USDT: 'bg-teal-100  text-teal-800  dark:bg-teal-900/30  dark:text-teal-400',
  USDC: 'bg-blue-100  text-blue-800  dark:bg-blue-900/30  dark:text-blue-400',
};

/** Format decimal amount to 2dp for display */
function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return amount;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/** Truncate a long hex/base58 hash to first 8 + … + last 4 chars */
function truncateHash(hash: string | null): string {
  if (!hash) return '—';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

/** Relative time label, e.g. "3m ago" */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function DepositsTable({ deposits, total, page, limit, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elev)]">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              {['Time', 'User ID', 'Chain', 'Token', 'Amount', 'TX Hash', 'Blocks', 'Status'].map((col) => (
                <th key={col} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-faint)]">
                  No deposits found
                </td>
              </tr>
            ) : (
              deposits.map((dep) => (
                <tr key={dep.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-hover)]">
                  <td className="px-4 py-2.5 text-[var(--text-muted)] whitespace-nowrap">{relativeTime(dep.createdAt)}</td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-faint)]" title={dep.userId}>
                    {dep.userId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="uppercase font-mono text-[var(--text)]">{dep.chain}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${TOKEN_CLASSES[dep.token]}`}>
                      {dep.token}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[var(--text)]">
                    {formatAmount(dep.amount)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-faint)]" title={dep.txHash ?? undefined}>
                    {truncateHash(dep.txHash)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">{dep.confirmedBlocks}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CLASSES[dep.status]}`}>
                      {dep.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-[12px] text-[var(--text-muted)]">
          <span>{total} total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded border border-[var(--line)] disabled:opacity-40 hover:bg-[var(--bg-hover)] transition-colors"
            >
              ‹ Prev
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded border border-[var(--line)] disabled:opacity-40 hover:bg-[var(--bg-hover)] transition-colors"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
