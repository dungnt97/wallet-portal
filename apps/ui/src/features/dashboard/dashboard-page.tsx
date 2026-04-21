// Dashboard page — split sub-components.
// Recent-activity feed uses real /transactions endpoint.
import { useTransactions } from '@/api/queries';
import { ChainPill, Hash, PageFrame, StatusBadge } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { DashboardChart, HoldingsList } from './dashboard-chart';
import { DashboardKpiGrid } from './dashboard-kpi-grid';
import {
  AlertsList,
  ComplianceList,
  GasWalletList,
  SLAGrid,
  SystemStatusList,
} from './dashboard-panels';
import { DashboardPolicyStrip } from './dashboard-policy-strip';

export function DashboardPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const rt = useRealtime();
  const qc = useQueryClient();

  const { data: txPage, isLoading: txLoading, refetch } = useTransactions({ limit: 6 });
  const recentTx = txPage?.data ?? [];

  const doRefresh = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    toast(t('dashboard.refreshed'), 'success');
  };

  const goTo = (p: string) => nav(`/app/${p}`);

  return (
    <PageFrame
      eyebrow={
        <>
          {t('dashboard.eyebrow')} · <span className="env-inline">{t('topbar.env')}</span>
        </>
      }
      title={t('dashboard.title')}
      policyStrip={<DashboardPolicyStrip />}
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> {t('dashboard.live')} · {t('dashboard.updated')}{' '}
            <LiveTimeAgo at={new Date(rt.now - 1200).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doRefresh}>
            <I.Refresh size={13} />
            {t('dashboard.refresh')}
          </button>
          <button className="btn btn-accent" onClick={() => goTo('withdrawals')}>
            <I.Plus size={13} /> {t('dashboard.newWithdrawal')}
          </button>
        </>
      }
      kpis={<DashboardKpiGrid onNavigate={(p) => goTo(p)} />}
    >
      <div className="dash-grid-2">
        <DashboardChart />
        <HoldingsList />
      </div>

      <div className="dash-grid-activity">
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('dashboard.activityFeed')}</h3>
            <span className="text-xs text-muted hstack">
              <LiveDot /> {t('dashboard.live')}
            </span>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('transactions')}>
              {t('dashboard.viewAll')} <I.ChevronRight size={11} />
            </button>
          </div>
          {txLoading ? (
            <div className="text-xs text-muted" style={{ padding: 16 }}>
              {t('common.loading')}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="text-xs text-muted" style={{ padding: 16 }}>
              {t('common.empty')}
            </div>
          ) : (
            <table className="table table-tight">
              <thead>
                <tr>
                  <th>{t('dashboard.event')}</th>
                  <th>{t('dashboard.colChain')}</th>
                  <th className="num">{t('dashboard.colAmount')}</th>
                  <th>{t('dashboard.colHash')}</th>
                  <th>{t('dashboard.colStatus')}</th>
                  <th className="num">{t('dashboard.colWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => goTo('transactions')}
                    style={{ cursor: 'pointer' }}
                  >
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
          )}
        </div>

        <div>
          <div className="card pro-card" style={{ marginBottom: 12 }}>
            <div className="pro-card-header">
              <h3 className="card-title">{t('dashboard.alerts')}</h3>
              <div className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => goTo('audit')}>
                {t('dashboard.log')} <I.ChevronRight size={11} />
              </button>
            </div>
            <AlertsList />
          </div>

          <div className="card pro-card">
            <div className="pro-card-header">
              <h3 className="card-title">{t('dashboard.systemStatus')}</h3>
              <span className="badge-tight ok">
                <span className="dot" />
                {t('dashboard.operational')}
              </span>
            </div>
            <SystemStatusList />
          </div>
        </div>
      </div>

      <div className="dash-grid-3">
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('dashboard.gasWallets')}</h3>
            <span className="text-xs text-muted">{t('dashboard.gasHint')}</span>
          </div>
          <GasWalletList />
        </div>
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('dashboard.sla24h')}</h3>
            <span className="text-xs text-muted">{t('dashboard.observed').toLowerCase()}</span>
          </div>
          <SLAGrid />
        </div>
        <div className="card pro-card">
          <div className="pro-card-header">
            <h3 className="card-title">{t('dashboard.compliance')}</h3>
            <span className="badge-tight ok">
              <span className="dot" />
              {t('dashboard.clean').toLowerCase()}
            </span>
          </div>
          <ComplianceList />
        </div>
      </div>
    </PageFrame>
  );
}
