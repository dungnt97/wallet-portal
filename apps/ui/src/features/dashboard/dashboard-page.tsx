// Dashboard page — real metrics from GET /dashboard/metrics, refreshed via Socket.io
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { KpiCards, type DashboardMetrics } from './kpi-cards';

export function DashboardPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.get<DashboardMetrics>('/dashboard/metrics'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('pageTitles.dashboard')}</h1>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[12px] text-red-700 dark:text-red-400">
          Failed to load metrics. Retrying…
        </div>
      )}

      <KpiCards
        metrics={data ?? {
          aumUsdt: '0', aumUsdc: '0',
          pendingDeposits: 0, pendingDepositsValue: '0',
          pendingWithdrawals: 0, pendingMultisigOps: 0,
          blockSyncBnb: null, blockSyncSol: null,
        }}
        isLoading={isLoading}
      />

      {/* Block sync status footer */}
      {data && (
        <div className="flex gap-4 text-[11px] text-[var(--text-faint)]">
          <span>BNB block: {data.blockSyncBnb ?? '—'}</span>
          <span>SOL slot: {data.blockSyncSol ?? '—'}</span>
        </div>
      )}
    </div>
  );
}
