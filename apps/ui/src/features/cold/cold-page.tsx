// Cold wallet rebalance page — real balance + wallet metadata from API.
// Layout: 2 vertical chain sections (BNB, SOL), each with 3-col hot/arrows/cold grid.
// Prototype fidelity: cold-pair, cold-pair-head, cold-pair-wallets, cold-advisory CSS classes.
import {
  useColdBalances,
  useColdWallets,
  useRebalanceHistory,
  useRunBandCheck,
} from '@/api/queries';
import type { RebalanceHistoryRow } from '@/api/queries';
import { useAuth } from '@/auth/use-auth';
import { ChainPill, PageFrame, StatusBadge } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';
import { ColdChainSection } from './cold-chain-section';
import { RebalanceModal } from './rebalance-modal';

export function ColdPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff } = useAuth();
  const canRebalance = staff?.role === 'admin' || staff?.role === 'operator';

  const [rebalanceOpen, setRebalanceOpen] = useState<{
    chain: 'bnb' | 'sol';
    direction: 'hot→cold' | 'cold→hot';
  } | null>(null);

  const { data: balances, isLoading: balancesLoading, isError: balancesError } = useColdBalances();
  const { data: walletMetas } = useColdWallets();
  const { data: historyData } = useRebalanceHistory();
  const history: RebalanceHistoryRow[] = historyData?.data ?? [];
  const bandCheckMutation = useRunBandCheck();

  const handleRunBandCheck = async () => {
    try {
      await bandCheckMutation.mutateAsync();
      toast(t('cold.bandCheckTriggered'));
    } catch {
      toast(t('cold.bandCheckError'), 'error');
    }
  };

  const hotBnb = walletMetas?.find((w) => w.chain === 'bnb' && w.tier === 'hot');
  const coldBnb = walletMetas?.find((w) => w.chain === 'bnb' && w.tier === 'cold');
  const hotSol = walletMetas?.find((w) => w.chain === 'sol' && w.tier === 'hot');
  const coldSol = walletMetas?.find((w) => w.chain === 'sol' && w.tier === 'cold');

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
            <span className="text-muted">{t('cold.thresholdLabel')}</span>
            <span className="fw-600">2/3 (outbound) · 3/5 cold signers</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Clock size={11} />
            <span className="text-muted">{t('cold.bandCheckLabel')}</span>
            <span className="fw-600">{t('cold.bandCheckInterval')}</span>
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
          onClick={() => void handleRunBandCheck()}
          disabled={bandCheckMutation.isPending}
        >
          <I.Refresh size={12} />
          {bandCheckMutation.isPending ? '…' : t('cold.runBandCheck')}
        </button>
      }
    >
      {/* ── Loading / error states ── */}
      {balancesLoading && (
        <div className="text-sm text-muted" style={{ padding: '16px 0' }}>
          {t('common.loading')}
        </div>
      )}

      {balancesError && (
        <div className="alert err" style={{ margin: '8px 0' }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-text">{t('cold.balancesError')}</div>
          </div>
        </div>
      )}

      {/* ── Chain sections — vertical stack ── */}
      {balances && (
        <div className="cold-grid">
          <ColdChainSection
            chain="bnb"
            balanceEntries={balances}
            hotMeta={hotBnb}
            coldMeta={coldBnb}
            canRebalance={canRebalance}
            onRebalance={(chain, direction) => setRebalanceOpen({ chain, direction })}
          />
          <ColdChainSection
            chain="sol"
            balanceEntries={balances}
            hotMeta={hotSol}
            coldMeta={coldSol}
            canRebalance={canRebalance}
            onRebalance={(chain, direction) => setRebalanceOpen({ chain, direction })}
          />
        </div>
      )}

      {/* ── Rebalance history table ── */}
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
              <th>{t('cold.colDirection')}</th>
              <th>Chain</th>
              <th className="num">{t('cold.colAmount')}</th>
              <th>Sigs</th>
              <th>{t('cold.colStatus')}</th>
              <th>{t('cold.colProposer')}</th>
              <th className="num">{t('cold.colCreated')}</th>
              <th className="num">{t('cold.colExecuted')}</th>
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
                  {t('cold.historyEmpty')}
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

      {/* ── Rebalance modal ── */}
      <RebalanceModal
        open={rebalanceOpen !== null}
        chain={rebalanceOpen?.chain ?? null}
        onClose={() => setRebalanceOpen(null)}
      />
    </PageFrame>
  );
}
