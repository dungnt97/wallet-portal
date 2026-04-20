// Dashboard page stub — summary cards + placeholder table
// Real data wired in Phase 09
import { useTranslation } from 'react-i18next';
import { TrendingUp, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from 'lucide-react';

const STAT_CARDS = [
  { label: 'Total Deposits (24h)', value: '$0.00', icon: ArrowDownToLine, color: 'ok' },
  { label: 'Pending Withdrawals', value: '0',     icon: ArrowUpFromLine,  color: 'warn' },
  { label: 'Active Users',        value: '0',     icon: TrendingUp,       color: 'info' },
  { label: 'TX Errors',           value: '0',     icon: AlertTriangle,    color: 'err' },
] as const;

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('pageTitles.dashboard')}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">{card.label}</span>
                <Icon size={14} className={`text-[var(--${card.color})]`} />
              </div>
              <div className="text-[22px] font-semibold text-[var(--text)]">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Recent activity placeholder */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <span className="text-[13px] font-medium text-[var(--text)]">Recent Activity</span>
        </div>
        <PlaceholderTable columns={['Time', 'Type', 'Chain', 'Amount', 'Status']} rows={5} />
      </div>
    </div>
  );
}

function PlaceholderTable({ columns, rows }: { columns: string[]; rows: number }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-[var(--line)]">
          {columns.map((col) => (
            <th key={col} className="px-4 py-2 text-left font-medium text-[var(--text-muted)]">{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="border-b border-[var(--line)] last:border-0">
            {columns.map((col) => (
              <td key={col} className="px-4 py-2.5">
                <div className="h-3 rounded bg-[var(--bg-muted)] animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
