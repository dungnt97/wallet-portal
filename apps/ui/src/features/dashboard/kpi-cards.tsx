// KPI cards — shows real metrics from GET /dashboard/metrics
// Updates when Socket.io deposit.credited event fires (via dashboard query invalidation)
import { TrendingUp, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, type LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export interface DashboardMetrics {
  aumUsdt: string;
  aumUsdc: string;
  pendingDeposits: number;
  pendingDepositsValue: string;
  pendingWithdrawals: number;
  pendingMultisigOps: number;
  blockSyncBnb: number | null;
  blockSyncSol: number | null;
}

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  colorVar: string;
  sub?: string;
}

function KpiCard({ label, value, icon: Icon, colorVar, sub }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        <Icon size={14} className={colorVar} />
      </div>
      <div className="text-[22px] font-semibold text-[var(--text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

interface Props {
  metrics: DashboardMetrics;
  isLoading?: boolean;
}

/** Format decimal string as currency, e.g. "1000000.50" → "$1,000,000.50" */
function formatUsd(val: string): string {
  const n = parseFloat(val ?? '0');
  if (Number.isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function KpiCards({ metrics, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 space-y-2">
            <div className="h-3 w-24 rounded bg-[var(--bg-muted)] animate-pulse" />
            <div className="h-7 w-16 rounded bg-[var(--bg-muted)] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const cards: KpiCardProps[] = [
    {
      label: 'AUM (USDT)',
      value: formatUsd(metrics.aumUsdt),
      icon: TrendingUp,
      colorVar: 'text-[var(--ok)]',
    },
    {
      label: 'Pending Deposits',
      value: metrics.pendingDeposits,
      icon: ArrowDownToLine,
      colorVar: 'text-[var(--warn)]',
      sub: metrics.pendingDeposits > 0 ? `${formatUsd(metrics.pendingDepositsValue)} pending` : undefined,
    },
    {
      label: 'Pending Withdrawals',
      value: metrics.pendingWithdrawals,
      icon: ArrowUpFromLine,
      colorVar: 'text-[var(--info)]',
    },
    {
      label: 'Pending Multisig Ops',
      value: metrics.pendingMultisigOps,
      icon: AlertTriangle,
      colorVar: 'text-[var(--err)]',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
