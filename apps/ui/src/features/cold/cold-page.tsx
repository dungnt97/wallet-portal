// Cold wallet rebalance page — real balance data from GET /cold/balances.
// Rebalance history wired to real GET /rebalance/history; REBALANCE_HISTORY fixture removed.
import { useColdBalances, useRebalanceHistory } from '@/api/queries';
import type { RebalanceHistoryRow } from '@/api/queries';
import { useAuth } from '@/auth/use-auth';
import { ChainPill, PageFrame, StatusBadge } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';
import { ColdBalanceCards } from './cold-balance-cards';
import { RebalanceModal } from './rebalance-modal';

export function ColdPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff } = useAuth();
  const canRebalance = staff?.role === 'admin' || staff?.role === 'operator';

  const [rebalanceChain, setRebalanceChain] = useState<'bnb' | 'sol' | null>(null);

  const { data: balances, isLoading, isError } = useColdBalances();
  const { data: historyData } = useRebalanceHistory();
  const history: RebalanceHistoryRow[] = historyData?.data ?? [];

  return (
    <PageFrame
      eyebrow={
        <>
          {t('cold.eyebrow')} · <span className="env-inline">{t('cold.subtitle')}</span>
        </>
      }
      title={t('cold.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Lock size={11} />
            <span className="text-muted">Cold:</span>
            <span className="fw-600">HSM · geographically split</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Shield size={11} />
            <span className="text-muted">Threshold:</span>
            <span className="fw-600">2/3 (outbound) · 3/5 cold signers</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Clock size={11} />
            <span className="text-muted">Band check:</span>
            <span className="fw-600">every 15m</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => toast('Manual band check triggered.')}
        >
          <I.Refresh size={12} /> {t('cold.runBandCheck')}
        </button>
      }
    >
      {/* ── Real balance cards ── */}
      <div className="card pro-card" style={{ marginBottom: 14 }}>
        <div className="pro-card-header">
          <h3 className="card-title">{t('cold.balancesTitle')}</h3>
          <span className="text-xs text-muted">{t('cold.balancesHint')}</span>
        </div>

        {isLoading && (
          <div className="text-sm text-muted" style={{ padding: '16px 0' }}>
            {t('common.loading')}
          </div>
        )}

        {isError && (
          <div className="alert err" style={{ margin: '8px 0' }}>
            <I.AlertTri size={13} className="alert-icon" />
            <div className="alert-body">
              <div className="alert-text">{t('cold.balancesError')}</div>
            </div>
          </div>
        )}

        {balances && balances.length > 0 && (
          <ColdBalanceCards
            entries={balances}
            canRebalance={canRebalance}
            onRebalance={(chain) => setRebalanceChain(chain)}
          />
        )}
      </div>

      {/* ── Rebalance history (fixture-driven until rebalance list API ships) ── */}
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <h3 className="card-title">{t('cold.historyTitle')}</h3>
          <span className="text-xs text-muted">{t('cold.historyHint')}</span>
          <div className="spacer" />
          <span className="text-xs text-muted text-mono">{history.length} ops</span>
        </div>
        <table className="table table-tight">
          <thead>
            <tr>
              <th>ID</th>
              <th>Direction</th>
              <th>Chain</th>
              <th className="num">Amount</th>
              <th>Sigs</th>
              <th>Status</th>
              <th>Proposer</th>
              <th className="num">Created</th>
              <th className="num">Executed</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="text-sm text-muted"
                  style={{ textAlign: 'center', padding: 32 }}
                >
                  No rebalance history yet.
                </td>
              </tr>
            )}
            {history.map((r) => (
              <tr key={r.id}>
                <td className="text-mono fw-500">{r.id}</td>
                <td>
                  <span className={`badge-tight ${r.direction === 'hot→cold' ? 'info' : 'warn'}`}>
                    {r.direction}
                  </span>
                </td>
                <td>
                  <ChainPill chain={r.chain} />
                </td>
                <td className="num text-mono fw-500">${fmtUSD(r.amount)}</td>
                <td className="text-xs text-mono">{r.sigs}/2</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="text-sm text-mono text-xs text-muted">{r.proposer.slice(0, 8)}…</td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={r.createdAt} />
                </td>
                <td className="num text-xs text-muted">
                  {r.executedAt ? <LiveTimeAgo at={r.executedAt} /> : '—'}
                </td>
                <td className="text-mono text-xs">{r.txHash ? shortHash(r.txHash, 6, 4) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Rebalance modal (has its own Sheet internally) ── */}
      <RebalanceModal
        open={rebalanceChain !== null}
        chain={rebalanceChain}
        onClose={() => setRebalanceChain(null)}
      />
    </PageFrame>
  );
}
