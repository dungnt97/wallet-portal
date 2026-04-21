import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
// Deposits page — prototype visual port. Real data via existing useDeposits
// hook (falls back to fixtures when API empty). Keeps socket listener.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerCsvDownload } from '../_shared/csv-export-trigger';
import { FIX_DEPOSITS, type FixDeposit } from '../_shared/fixtures';
import { LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { DepositsKpiStrip } from './deposits-kpi-strip';
import { DepositsPolicyStrip } from './deposits-policy-strip';
import { DepositSheet } from './deposits-sheet';
import { DepositsTable } from './deposits-table';
import { ManualCreditModal } from './manual-credit-modal';
import { useDepositSocketListener } from './socket-listener';
import { type Deposit, useDeposits } from './use-deposits';

const PAGE_SIZE = 15;

type StatusTab = 'all' | 'pending' | 'credited' | 'swept';

// Map API Deposit → FixDeposit shape used by table/detail view.
function toFix(d: Deposit): FixDeposit {
  return {
    id: d.id,
    userId: d.userId,
    userName: d.userId.slice(0, 10),
    chain: d.chain,
    token: d.token,
    amount: Number.parseFloat(d.amount) || 0,
    status: d.status,
    address: '—',
    txHash: d.txHash ?? '—',
    confirmations: d.confirmedBlocks,
    requiredConfirmations: d.chain === 'bnb' ? 15 : 32,
    detectedAt: d.createdAt,
    creditedAt: d.status !== 'pending' ? d.updatedAt : null,
    sweptAt: d.status === 'swept' ? d.updatedAt : null,
    risk: 'low',
    blockNumber: 0,
  };
}

export function DepositsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const rt = useRealtime();
  const [tab, setTab] = useState<StatusTab>('all');
  const [chainFilter, setChainFilter] = useState<'bnb' | 'sol' | null>(null);
  const [tokenFilter, setTokenFilter] = useState<'USDT' | 'USDC' | null>(null);
  const [selected, setSelected] = useState<FixDeposit | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [manualCreditOpen, setManualCreditOpen] = useState(false);

  useDepositSocketListener();

  const { data, refetch, isLoading } = useDeposits({
    page,
    limit: PAGE_SIZE,
    status: tab === 'all' ? undefined : tab,
    chain: chainFilter ?? undefined,
    token: tokenFilter ?? undefined,
  });

  // Prefer real data when present; otherwise fall back to prototype fixtures.
  const deposits: FixDeposit[] = useMemo(() => {
    if (data?.data && data.data.length > 0) return data.data.map(toFix);
    return FIX_DEPOSITS;
  }, [data]);

  const filtered = useMemo(
    () =>
      deposits.filter((d) => {
        if (tab !== 'all' && d.status !== tab) return false;
        if (chainFilter && d.chain !== chainFilter) return false;
        if (tokenFilter && d.token !== tokenFilter) return false;
        return true;
      }),
    [deposits, tab, chainFilter, tokenFilter]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: filter signature only
  useEffect(() => {
    setPage(1);
  }, [tab, chainFilter, tokenFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const doRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => {
      setRefreshing(false);
      toast(t('deposits.refreshed'), 'success');
    });
  };

  const doExport = () => {
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('status', tab);
    if (chainFilter) params.set('chain', chainFilter);
    if (tokenFilter) params.set('token', tokenFilter);
    triggerCsvDownload(`/api/deposits/export.csv?${params.toString()}`);
    toast(t('deposits.exportedRows', { n: filtered.length }), 'success');
  };

  const counts = {
    all: deposits.length,
    pending: deposits.filter((d) => d.status === 'pending').length,
    credited: deposits.filter((d) => d.status === 'credited').length,
    swept: deposits.filter((d) => d.status === 'swept').length,
  };

  return (
    <PageFrame
      eyebrow={
        <>
          {t('deposits.eyebrow')} · <span className="env-inline">{t('deposits.subEyebrow')}</span>
        </>
      }
      title={t('deposits.title')}
      policyStrip={<DepositsPolicyStrip />}
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> {t('deposits.live')} · {t('deposits.updated')}{' '}
            <LiveTimeAgo at={new Date(rt.now - 1800).toISOString()} />
          </span>
          <button
            className="btn btn-secondary"
            onClick={doRefresh}
            disabled={refreshing || isLoading}
          >
            <I.Refresh
              size={13}
              style={refreshing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
            {t('deposits.refresh')}
          </button>
          <button className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> {t('deposits.exportCsv')}
          </button>
          <button className="btn btn-accent" onClick={() => setManualCreditOpen(true)}>
            <I.Plus size={13} /> {t('deposits.manualCredit.title')}
          </button>
        </>
      }
      kpis={<DepositsKpiStrip deposits={deposits} />}
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as StatusTab)}
            embedded
            tabs={[
              { value: 'all', label: t('deposits.tabAll'), count: counts.all },
              { value: 'pending', label: t('deposits.tabPending'), count: counts.pending },
              { value: 'credited', label: t('deposits.tabCredited'), count: counts.credited },
              { value: 'swept', label: t('deposits.tabSwept'), count: counts.swept },
            ]}
          />
          <div className="spacer" />
          <Filter
            label={t('deposits.fChain')}
            value={chainFilter ? CHAINS[chainFilter].short : undefined}
            active={!!chainFilter}
            onClick={() =>
              setChainFilter(chainFilter === 'bnb' ? 'sol' : chainFilter === 'sol' ? null : 'bnb')
            }
            onClear={() => setChainFilter(null)}
          />
          <Filter
            label={t('deposits.fToken')}
            value={tokenFilter ?? undefined}
            active={!!tokenFilter}
            onClick={() =>
              setTokenFilter(
                tokenFilter === 'USDT' ? 'USDC' : tokenFilter === 'USDC' ? null : 'USDT'
              )
            }
            onClear={() => setTokenFilter(null)}
          />
          <Filter label={t('deposits.fAmount')} />
          <Filter label={t('deposits.fDate')} />
          <span className="text-xs text-muted text-mono">
            {filtered.length}/{deposits.length}
          </span>
        </div>

        <DepositsTable rows={pageRows} onSelect={setSelected} />

        <div className="pagination">
          <span>
            {t('deposits.showing')} {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, filtered.length)} {t('deposits.of')} {filtered.length}
          </span>
          <div className="spacer" />
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <I.ChevronLeft size={12} /> {t('deposits.prev')}
          </button>
          <span>
            {t('deposits.page')} <span className="text-mono">{page}</span> {t('deposits.of')}{' '}
            <span className="text-mono">{totalPages}</span>
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('deposits.next')} <I.ChevronRight size={12} />
          </button>
        </div>
      </div>

      <DepositSheet deposit={selected} onClose={() => setSelected(null)} />
      <ManualCreditModal open={manualCreditOpen} onClose={() => setManualCreditOpen(false)} />
    </PageFrame>
  );
}
