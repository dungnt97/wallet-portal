// Withdrawals page — prototype visual + RBAC gating. Action handlers live in
// `use-withdrawal-actions.ts`; this file is pure composition.
import { useAuth } from '@/auth/use-auth';
import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { ROLES } from '@/lib/constants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerCsvDownload } from '../_shared/csv-export-trigger';
import { LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { SigningFlowHost, useSigningFlow } from '../signing';
import { NewWithdrawalForm } from './new-withdrawal-form';
import { useWithdrawalActions } from './use-withdrawal-actions';
import { useWithdrawalsSocketListener } from './use-withdrawals';
import { WithdrawalsKpiStrip } from './withdrawals-kpi-strip';
import { WithdrawalsPolicyStrip } from './withdrawals-policy-strip';
import { WithdrawalSheet } from './withdrawals-sheet';
import { WithdrawalsTable } from './withdrawals-table';

type Tab = 'all' | 'pending' | 'completed' | 'failed';

export function WithdrawalsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const rt = useRealtime();
  const { staff, hasPerm } = useAuth();
  const canCreate = hasPerm('withdrawal.create');

  useWithdrawalsSocketListener();
  const signingFlow = useSigningFlow();

  const [tab, setTab] = useState<Tab>('all');
  const [chainFilter, setChainFilter] = useState<'bnb' | 'sol' | null>(null);
  const [tokenFilter, setTokenFilter] = useState<'USDT' | 'USDC' | null>(null);
  const [datePreset, setDatePreset] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const DATE_PRESETS = [
    { label: t('common.today'), days: 1 },
    { label: t('common.last7d'), days: 7 },
    { label: t('common.last30d'), days: 30 },
  ] as const;

  const {
    list,
    selected,
    setSelected,
    onApprove,
    onReject,
    onExecute,
    onSubmitDraft,
    onNewSubmit,
    onSigningComplete,
    onSigningRejected,
  } = useWithdrawalActions(signingFlow, () => setCreateOpen(false));

  const filtered = list.filter((w) => {
    const tabMatch =
      tab === 'all'
        ? true
        : tab === 'pending'
          ? w.stage === 'awaiting_signatures' || w.stage === 'executing' || w.stage === 'draft'
          : w.stage === tab;
    if (!tabMatch) return false;
    if (chainFilter && w.chain !== chainFilter) return false;
    if (tokenFilter && w.token !== tokenFilter) return false;
    if (datePreset !== null) {
      const since = Date.now() - DATE_PRESETS[datePreset].days * 24 * 60 * 60 * 1000;
      if (new Date(w.createdAt).getTime() < since) return false;
    }
    return true;
  });
  const counts = {
    all: list.length,
    pending: list.filter(
      (w) => w.stage === 'awaiting_signatures' || w.stage === 'executing' || w.stage === 'draft'
    ).length,
    completed: list.filter((w) => w.stage === 'completed').length,
    failed: list.filter((w) => w.stage === 'failed').length,
  };

  const doExport = () => {
    const params = new URLSearchParams();
    if (tab === 'pending') params.set('status', 'pending');
    else if (tab === 'completed') params.set('status', 'completed');
    else if (tab === 'failed') params.set('status', 'failed');
    triggerCsvDownload(`/api/withdrawals/export.csv?${params.toString()}`);
    toast(t('withdrawals.exportedRows', { n: filtered.length }), 'success');
  };

  return (
    <PageFrame
      eyebrow={
        <>
          {t('withdrawals.eyebrow')} ·{' '}
          <span className="env-inline">{t('withdrawals.subEyebrow')}</span>
        </>
      }
      title={t('withdrawals.title')}
      policyStrip={<WithdrawalsPolicyStrip />}
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> {t('withdrawals.live')} · {t('withdrawals.updated')}{' '}
            <LiveTimeAgo at={new Date(rt.now - 2400).toISOString()} />
          </span>
          <button type="button" className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> {t('withdrawals.exportCsv')}
          </button>
          {canCreate ? (
            <button type="button" className="btn btn-accent" onClick={() => setCreateOpen(true)}>
              <I.Plus size={13} /> {t('withdrawals.newWithdrawal')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              disabled
              title={t('withdrawals.cannotCreate', {
                role: ROLES[staff?.role ?? 'viewer']?.label ?? '',
              })}
            >
              <I.Lock size={13} /> {t('withdrawals.newWithdrawal')}
            </button>
          )}
        </>
      }
      kpis={<WithdrawalsKpiStrip list={list} />}
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'all', label: t('withdrawals.tabAll'), count: counts.all },
              { value: 'pending', label: t('withdrawals.tabPending'), count: counts.pending },
              { value: 'completed', label: t('withdrawals.tabCompleted'), count: counts.completed },
              { value: 'failed', label: t('withdrawals.tabFailed'), count: counts.failed },
            ]}
          />
          <div className="spacer" />
          <Filter
            label={t('withdrawals.fChain')}
            value={chainFilter ?? undefined}
            active={!!chainFilter}
            onClick={() =>
              setChainFilter(chainFilter === 'bnb' ? 'sol' : chainFilter === 'sol' ? null : 'bnb')
            }
            onClear={() => setChainFilter(null)}
          />
          <Filter
            label={t('withdrawals.fToken')}
            value={tokenFilter ?? undefined}
            active={!!tokenFilter}
            onClick={() =>
              setTokenFilter(
                tokenFilter === 'USDT' ? 'USDC' : tokenFilter === 'USDC' ? null : 'USDT'
              )
            }
            onClear={() => setTokenFilter(null)}
          />
          <Filter
            label={t('withdrawals.fDate')}
            value={datePreset !== null ? DATE_PRESETS[datePreset].label : undefined}
            active={datePreset !== null}
            onClick={() =>
              setDatePreset((p) => (p === null ? 0 : p < DATE_PRESETS.length - 1 ? p + 1 : null))
            }
            onClear={() => setDatePreset(null)}
          />
          <span className="text-xs text-muted text-mono">
            {filtered.length}/{list.length}
          </span>
        </div>
        <WithdrawalsTable rows={filtered} onSelect={setSelected} />
      </div>

      <WithdrawalSheet
        withdrawal={selected}
        onClose={() => setSelected(null)}
        onApprove={onApprove}
        onReject={onReject}
        onExecute={onExecute}
        onSubmitDraft={onSubmitDraft}
      />
      <NewWithdrawalForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={onNewSubmit}
      />

      <SigningFlowHost
        flow={signingFlow}
        onComplete={onSigningComplete}
        onRejected={onSigningRejected}
      />
    </PageFrame>
  );
}
