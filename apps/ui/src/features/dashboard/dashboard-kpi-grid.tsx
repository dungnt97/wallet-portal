import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Dashboard KPI grid — big AUM card + three clickable KPI cards.
// Split from dashboard-page.tsx to stay under 200 LOC.
import { useMemo } from 'react';
import { Sparkline, makeSeries } from '../_shared/charts';
import { FIX_DEPOSITS, FIX_USERS, TOTAL_BALANCES } from '../_shared/fixtures';
import { FIX_DEPOSIT_ADDRESSES, FIX_MULTISIG_OPS } from '../_shared/fixtures-flows';

interface Props {
  onNavigate: (page: 'deposits' | 'sweep' | 'multisig' | 'transactions') => void;
}

export function DashboardKpiGrid({ onNavigate }: Props) {
  const totalBnb = TOTAL_BALANCES.bnb.USDT + TOTAL_BALANCES.bnb.USDC;
  const totalSol = TOTAL_BALANCES.sol.USDT + TOTAL_BALANCES.sol.USDC;
  const total = totalBnb + totalSol;

  const pendingDeposits = FIX_DEPOSITS.filter((d) => d.status === 'pending');
  const pendingDepositsValue = pendingDeposits.reduce((s, d) => s + d.amount, 0);
  const pendingSweep = FIX_DEPOSIT_ADDRESSES.filter((a) => a.balanceUSDT + a.balanceUSDC > 500);
  const pendingSweepValue = pendingSweep.reduce((s, a) => s + a.balanceUSDT + a.balanceUSDC, 0);
  const pendingMultisig = FIX_MULTISIG_OPS.filter((o) => o.status === 'collecting');
  const pendingMultisigValue = pendingMultisig.reduce((s, o) => s + (o.amount || 0), 0);

  const aumSeries = useMemo(
    () => makeSeries(42, 60, 0.12, 0.035).map((v) => v * total * 0.92),
    [total]
  );
  const depSeries = useMemo(() => makeSeries(101, 48, 0.04, 0.1).map((v) => v * 80_000), []);
  const bnbSpark = useMemo(() => makeSeries(301, 24, 0.05, 0.04), []);
  const solSpark = useMemo(() => makeSeries(302, 24, -0.02, 0.05), []);

  const aumWhole = fmtUSD(total).split('.')[0];
  const aumDec = fmtUSD(total).split('.')[1] || '00';

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
            <I.ArrowUp size={10} /> 2.4%
          </span>
          <span className="text-muted">vs 7d · {FIX_USERS.length} active wallets</span>
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
              ${fmtUSD(totalBnb)}
            </div>
            <div className="hstack gap-xs" style={{ marginTop: 2 }}>
              <Sparkline data={bnbSpark} width={64} height={14} stroke="oklch(72% 0.15 85)" />
              <span className="text-xs text-muted text-mono">+1.8%</span>
            </div>
          </div>
          <div className="kpi-breakdown-cell" onClick={() => onNavigate('transactions')}>
            <div className="hstack gap-xs">
              <ChainPill chain="sol" label={false} />
              <span className="text-muted text-xs">Solana</span>
            </div>
            <div className="text-mono fw-600" style={{ fontSize: 14, marginTop: 4 }}>
              ${fmtUSD(totalSol)}
            </div>
            <div className="hstack gap-xs" style={{ marginTop: 2 }}>
              <Sparkline data={solSpark} width={64} height={14} stroke="oklch(70% 0.18 290)" />
              <span className="text-xs" style={{ color: 'var(--err-text)' }}>
                -0.4%
              </span>
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
          <span className="text-xs text-muted text-mono">{pendingDeposits.length}</span>
        </div>
        <div className="kpi-value-sm">${fmtCompact(pendingDepositsValue)}</div>
        <div className="kpi-foot text-xs text-muted">Awaiting confirmations</div>
        <Sparkline data={depSeries.slice(-24)} width={220} height={32} stroke="var(--ok)" />
      </div>

      {/* Ready to sweep */}
      <div className="kpi kpi-clickable" onClick={() => onNavigate('sweep')}>
        <div className="kpi-row">
          <div className="kpi-label">
            <I.Sweep size={11} />
            Ready to sweep
          </div>
          <span className="text-xs text-muted text-mono">{pendingSweep.length}</span>
        </div>
        <div className="kpi-value-sm">${fmtCompact(pendingSweepValue)}</div>
        <div className="kpi-foot text-xs text-muted">across {pendingSweep.length} addrs</div>
        <div className="threshold-gauge" style={{ marginTop: 14 }}>
          <div
            className="threshold-gauge-bar"
            style={{ width: `${(pendingSweep.length / FIX_DEPOSIT_ADDRESSES.length) * 100}%` }}
          />
          <div className="threshold-gauge-label text-xs text-mono text-muted">
            {pendingSweep.length}/{FIX_DEPOSIT_ADDRESSES.length}
          </div>
        </div>
      </div>

      {/* Multisig pending */}
      <div className="kpi kpi-clickable" onClick={() => onNavigate('multisig')}>
        <div className="kpi-row">
          <div className="kpi-label">
            <I.Shield size={11} />
            Multisig pending
          </div>
          <span className="text-xs text-muted text-mono">{pendingMultisig.length}</span>
        </div>
        <div className="kpi-value-sm">${fmtCompact(pendingMultisigValue)}</div>
        <div className="kpi-foot text-xs text-muted">awaiting signatures</div>
        <div className="multisig-stack">
          {pendingMultisig.slice(0, 4).map((o) => (
            <div key={o.id} className="multisig-stack-row">
              <span className="text-mono text-xs" style={{ flex: 1 }}>
                {o.id}
              </span>
              <div className="approval-pips">
                {Array.from({ length: o.required }, (_, j) => (
                  <span key={j} className={`approval-pip ${j < o.collected ? 'on' : ''}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
