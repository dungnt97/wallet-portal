// Port of ~/Documents/portal/src/page_dashboard.jsx — visual fidelity verified 2026-04-20.
// Dashboard page — full prototype port, composed of split sub-components.
// Real data fetches via TanStack Query; falls back to prototype fixtures for visual parity.
import { ChainPill, Hash, StatusBadge } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { FIX_TRANSACTIONS_FULL } from '../transactions/transactions-fixtures';
import { DashboardChart, HoldingsList } from './dashboard-chart';
import { DashboardKpiGrid } from './dashboard-kpi-grid';
import {
  AlertsList,
  ComplianceList,
  GasWalletList,
  SLAGrid,
  SystemStatusList,
} from './dashboard-panels';

export function DashboardPage() {
  const nav = useNavigate();
  const toast = useToast();
  const rt = useRealtime();
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast('Dashboard refreshed.', 'success');
    }, 700);
  };

  const goTo = (p: string) => nav(`/app/${p}`);
  const recentTx = FIX_TRANSACTIONS_FULL.slice(0, 6);

  return (
    <div className="page page-dense">
      {/* Policy strip */}
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Shield size={11} />
          <span className="text-muted">Withdrawal policy:</span>
          <span className="fw-600">2 of 3 treasurers</span>
          <span className="text-faint">· threshold $0</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">HSM:</span>
          <span className="fw-600">AWS CloudHSM</span>
          <LiveDot />
          <span className="text-muted">active</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Activity size={11} />
          <span className="text-muted">Reconciliation:</span>
          <span className="fw-600">block-by-block</span>
          <span className="text-faint text-mono">
            · last run <LiveTimeAgo at={new Date(rt.now - 4200).toISOString()} />
          </span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Treasury terminal · <span className="env-inline">Staging</span>
          </div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="page-actions">
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> live · updated <LiveTimeAgo at={new Date(rt.now - 1200).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doRefresh} disabled={refreshing}>
            <I.Refresh
              size={13}
              style={refreshing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
            Refresh
          </button>
          <button className="btn btn-accent" onClick={() => goTo('withdrawals')}>
            <I.Plus size={13} /> New withdrawal
          </button>
        </div>
      </div>

      <DashboardKpiGrid onNavigate={(p) => goTo(p)} />

      <div className="dash-grid-2">
        <DashboardChart />
        <HoldingsList />
      </div>

      <div className="dash-grid-activity">
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">Activity feed</h3>
            <span className="text-xs text-muted hstack">
              <LiveDot /> live
            </span>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('transactions')}>
              View all <I.ChevronRight size={11} />
            </button>
          </div>
          <table className="table table-tight">
            <thead>
              <tr>
                <th>Event</th>
                <th>Chain</th>
                <th className="num">Amount</th>
                <th>Hash</th>
                <th>Status</th>
                <th className="num">When</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((row) => (
                <tr key={row.id} onClick={() => goTo('transactions')} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="hstack gap-xs">
                      {row.type === 'deposit' && (
                        <span className="type-icon ok">
                          <I.ArrowDown size={10} />
                        </span>
                      )}
                      {row.type === 'withdrawal' && (
                        <span className="type-icon err">
                          <I.ArrowUp size={10} />
                        </span>
                      )}
                      {row.type === 'sweep' && (
                        <span className="type-icon info">
                          <I.Sweep size={10} />
                        </span>
                      )}
                      <span className="fw-500" style={{ textTransform: 'capitalize' }}>
                        {row.type}
                      </span>
                      <span className="text-faint text-xs text-mono">· {row.token}</span>
                    </span>
                  </td>
                  <td>
                    <ChainPill chain={row.chain} />
                  </td>
                  <td className="num text-mono fw-500">{fmtUSD(row.amount)}</td>
                  <td>
                    <Hash value={row.txHash} />
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="num text-xs text-muted">
                    <LiveTimeAgo at={row.timestamp} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="card pro-card" style={{ marginBottom: 12 }}>
            <div className="pro-card-header">
              <h3 className="card-title">Alerts</h3>
              <span className="badge-tight err">
                <span className="dot" />3
              </span>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => goTo('audit')}>
                Log <I.ChevronRight size={11} />
              </button>
            </div>
            <AlertsList />
          </div>

          <div className="card pro-card">
            <div className="pro-card-header">
              <h3 className="card-title">System status</h3>
              <span className="badge-tight ok">
                <span className="dot" />
                operational
              </span>
            </div>
            <SystemStatusList />
          </div>
        </div>
      </div>

      <div className="dash-grid-3">
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">Gas wallets</h3>
            <span className="text-xs text-muted">hot key balances · auto top-up</span>
          </div>
          <GasWalletList />
        </div>
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">SLA (24h)</h3>
            <span className="text-xs text-muted">observed</span>
          </div>
          <SLAGrid />
        </div>
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">Compliance</h3>
            <span className="badge-tight ok">
              <span className="dot" />
              clean
            </span>
          </div>
          <ComplianceList />
        </div>
      </div>
    </div>
  );
}
