// Deposits page — real data via TanStack Query + Socket.io live invalidation
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeposits } from './use-deposits';
import { useDepositSocketListener } from './socket-listener';
import { DepositsTable } from './deposits-table';

export function DepositsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'credited' | 'swept' | 'failed' | undefined>(undefined);

  // Subscribe to Socket.io deposit.credited events — invalidates deposits query
  useDepositSocketListener();

  const { data, isLoading, isError } = useDeposits({ page, limit: 20, status: statusFilter });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('pageTitles.deposits')}</h1>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setStatusFilter(v ? (v as typeof statusFilter) : undefined);
              setPage(1);
            }}
            className="text-[12px] px-2 py-1 rounded border border-[var(--line)] bg-[var(--bg-elev)] text-[var(--text)] outline-none"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="credited">Credited</option>
            <option value="swept">Swept</option>
            <option value="failed">Failed</option>
          </select>
          {data && (
            <span className="text-[11px] bg-[var(--accent-soft)] text-[var(--accent-text)] px-2 py-0.5 rounded-full">
              {data.total} total
            </span>
          )}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[12px] text-red-700 dark:text-red-400">
          Failed to load deposits. Retrying…
        </div>
      )}

      {isLoading ? (
        <SkeletonTable />
      ) : (
        <DepositsTable
          deposits={data?.data ?? []}
          total={data?.total ?? 0}
          page={page}
          limit={20}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function SkeletonTable() {
  const cols = 8;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elev)]">
      <table className="w-full text-[12px]">
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--line)] last:border-0">
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-3 rounded bg-[var(--bg-muted)] animate-pulse" style={{ width: `${40 + ((i * 7 + j * 3) % 40)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
