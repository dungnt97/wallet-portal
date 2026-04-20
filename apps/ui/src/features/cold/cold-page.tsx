// Cold wallet rebalance page — keeps hot wallet in target band.
// Ports prototype page_cold.jsx with local fixtures.
import { useAuth } from '@/auth/use-auth';
import { ChainPill, StatusBadge } from '@/components/custody';
import { Sheet, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { FIXTURE_STAFF } from '@/lib/constants';
import { fmtUSD, shortHash } from '@/lib/format';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COLD_WALLETS,
  HOT_WALLETS,
  REBALANCE_HISTORY,
  type RebalanceOp,
} from '../_shared/fixtures';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';
import { ColdPairCard } from './cold-pair-card';
import { type ProposeConfig, ProposeRebalanceForm } from './propose-rebalance-form';

export function ColdPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff } = useAuth();
  const canPropose = staff?.role === 'admin' || staff?.role === 'operator';
  const [proposeOpen, setProposeOpen] = useState<ProposeConfig | null>(null);
  const [history, setHistory] = useState<RebalanceOp[]>(REBALANCE_HISTORY);

  const proposeRebalance = (p: {
    chain: 'bnb' | 'sol';
    direction: 'hot→cold' | 'cold→hot';
    amount: number;
  }) => {
    const req: RebalanceOp = {
      id: `rb_${Math.floor(Math.random() * 9000 + 1000)}`,
      chain: p.chain,
      direction: p.direction,
      amount: p.amount,
      createdAt: new Date().toISOString(),
      executedAt: null,
      sigs: 0,
      status: 'awaiting_signatures',
      txHash: null,
      proposer: staff?.id ?? 'stf_mira',
    };
    setHistory([req, ...history]);
    setProposeOpen(null);
    toast(`Rebalance ${req.id} proposed — awaiting 2/3 signatures`, 'success');
  };

  return (
    <div className="page page-dense">
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

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            {t('cold.eyebrow')} · <span className="env-inline">{t('cold.subtitle')}</span>
          </div>
          <h1 className="page-title">{t('cold.title')}</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => toast('Manual band check triggered.')}
          >
            <I.Refresh size={12} /> Run band check
          </button>
        </div>
      </div>

      <div className="cold-grid">
        {HOT_WALLETS.map((h) => {
          const cold = COLD_WALLETS.find((c) => c.chain === h.chain);
          if (!cold) return null;
          return (
            <ColdPairCard
              key={h.id}
              hot={h}
              cold={cold}
              canPropose={canPropose}
              onPropose={setProposeOpen}
            />
          );
        })}
      </div>

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <h3 className="card-title">Rebalance history</h3>
          <span className="text-xs text-muted">All cold-wallet movements · each 2/3 signed</span>
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
            {history.map((r) => {
              const proposer = FIXTURE_STAFF.find((s) => s.id === r.proposer);
              return (
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
                  <td className="text-sm">{proposer?.name ?? '—'}</td>
                  <td className="num text-xs text-muted">
                    <LiveTimeAgo at={r.createdAt} />
                  </td>
                  <td className="num text-xs text-muted">
                    {r.executedAt ? <LiveTimeAgo at={r.executedAt} /> : '—'}
                  </td>
                  <td className="text-mono text-xs">
                    {r.txHash ? shortHash(r.txHash, 6, 4) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet
        open={!!proposeOpen}
        onClose={() => setProposeOpen(null)}
        title={proposeOpen ? `Propose ${proposeOpen.direction}` : ''}
        subtitle="Will require 2/3 Treasurer approval before execution"
      >
        {proposeOpen && (
          <ProposeRebalanceForm
            config={proposeOpen}
            onSubmit={proposeRebalance}
            onCancel={() => setProposeOpen(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
