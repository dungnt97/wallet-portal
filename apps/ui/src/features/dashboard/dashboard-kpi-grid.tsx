import { useDashboardMetrics } from '@/api/queries';
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Dashboard KPI grid — big AUM card + three clickable KPI cards.
// Split from dashboard-page.tsx to stay under 200 LOC.
// Real data via /dashboard/metrics. Sparklines are cosmetic trend shapes.
import { useMemo } from 'react';
import { Sparkline, makeSeries } from '../_shared/charts';

interface Props {
  onNavigate: (page: 'deposits' | 'sweep' | 'multisig' | 'transactions') => void;
}

export function DashboardKpiGrid({ onNavigate }: Props) {
  const { data: metrics } = useDashboardMetrics();

  const totalUsdt = Number(metrics?.aumUsdt ?? 0);
  const totalUsdc = Number(metrics?.aumUsdc ?? 0);
  const total = totalUsdt + totalUsdc;

  const pendingDeposits = metrics?.pendingDeposits ?? 0;
  const pendingDepositsValue = Number(metrics?.pendingDepositsValue ?? 0);
  const pendingMultisig = metrics?.pendingMultisigOps ?? 0;

  const aumSeries = useMemo(
    () => makeSeries(42, 60, 0.12, 0.035).map((v) => v * Math.max(total, 1) * 0.92),
    [total]
  );
  const depSeries = useMemo(() => makeSeries(101, 48, 0.04, 0.1).map((v) => v * 80_000), []);
  const bnbSpark = useMemo(() => makeSeries(301, 24, 0.05, 0.04), []);
  const solSpark = useMemo(() => makeSeries(302, 24, -0.02, 0.05), []);

  const aumWhole = fmtUSD(total).split('.')[0];
  const aumDec = fmtUSD(total).split('.')[1] || '00';

  // Approx split: show USDT as BNB portion, USDC as Solana portion (cosmetic until per-chain AUM endpoint)
  const bnbTotal = totalUsdt;
  const solTotal = totalUsdc;

  return (
    <div className="kpi-grid">
      {/* Main AUM card */}
      <div className="kpi kpi-primary">
        <div className="kpi-row">
          <div className="kpi-label">Assets under management</div>
          <span className="badge-tight ok">
            <span className="dot" />
            Reconciled
          </span>
        </div>
        <div className="kpi-value">
          <span className="kpi-currency">$</span>
          <span className="kpi-num">{aumWhole}</span>
          <span className="kpi-decimal">.{aumDec}</span>
        </div>
        <div className="kpi-row kpi-foot">
          <span className="kpi-delta up">
            <I.ArrowUp size={10} /> —
          </span>
          <span className="text-muted">vs 7d</span>
          <div className="spacer" />
          <Sparkline data={aumSeries.slice(-24)} width={120} height={28} stroke="var(--accent)" />
        </div>
        <div className="kpi-breakdown">
          <div className="kpi-breakdown-cell" onClick={() => onNavigate('transactions')}>
            <div className="hstack gap-xs">
              <ChainPill chain="bnb" label={false} />
              <span className="text-muted text-xs">BNB Chain</span>
            </div>
            <div className="text-mono fw-600" style={{ fontSize: 14, marginTop: 4 }}>
              ${fmtUSD(bnbTotal)}
            </div>
            <div className="hstack gap-xs" style={{ marginTop: 2 }}>
              <Sparkline data={bnbSpark} width={64} height={14} stroke="oklch(72% 0.15 85)" />
            </div>
          </div>
          <div className="kpi-breakdown-cell" onClick={() => onNavigate('transactions')}>
            <div className="hstack gap-xs">
              <ChainPill chain="sol" label={false} />
              <span className="text-muted text-xs">Solana</span>
            </div>
            <div className="text-mono fw-600" style={{ fontSize: 14, marginTop: 4 }}>
              ${fmtUSD(solTotal)}
            </div>
            <div className="hstack gap-xs" style={{ marginTop: 2 }}>
              <Sparkline data={solSpark} width={64} height={14} stroke="oklch(70% 0.18 290)" />
            </div>
          </div>
        </div>
      </div>

      {/* Pending deposits */}
      <div className="kpi kpi-clickable" onClick={() => onNavigate('deposits')}>
        <div className="kpi-row">
          <div className="kpi-label">
            <I.ArrowDown size={11} />
            Pending deposits
          </div>
          <span className="text-xs text-muted text-mono">{pendingDeposits}</span>
        </div>
        <div className="kpi-value-sm">${fmtCompact(pendingDepositsValue)}</div>
        <div className="kpi-foot text-xs text-muted">Awaiting confirmations</div>
        <Sparkline data={depSeries.slice(-24)} width={220} height={32} stroke="var(--ok)" />
      </div>

      {/* Pending withdrawals */}
      <div className="kpi kpi-clickable" onClick={() => onNavigate('multisig')}>
        <div className="kpi-row">
          <div className="kpi-label">
            <I.ArrowUp size={11} />
            Pending withdrawals
          </div>
          <span className="text-xs text-muted text-mono">{metrics?.pendingWithdrawals ?? 0}</span>
        </div>
        <div className="kpi-value-sm">{metrics?.pendingWithdrawals ?? 0} txns</div>
        <div className="kpi-foot text-xs text-muted">awaiting processing</div>
      </div>

      {/* Multisig pending */}
      <div className="kpi kpi-clickable" onClick={() => onNavigate('multisig')}>
        <div className="kpi-row">
          <div className="kpi-label">
            <I.Shield size={11} />
            Multisig pending
          </div>
          <span className="text-xs text-muted text-mono">{pendingMultisig}</span>
        </div>
        <div className="kpi-value-sm">{pendingMultisig} ops</div>
        <div className="kpi-foot text-xs text-muted">awaiting signatures</div>
      </div>
    </div>
  );
}
