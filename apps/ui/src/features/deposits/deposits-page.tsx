import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
// Deposits page — prototype visual port. Real data via existing useDeposits
// hook (falls back to fixtures when API empty). Keeps socket listener.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerCsvDownload } from '../_shared/csv-export-trigger';
import { LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import type { FixDeposit } from './deposit-types';
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
    // Use real email if available; fall back to userId prefix
    userName: d.userEmail ?? d.userId.slice(0, 10),
    chain: d.chain,
    token: d.token,
    amount: Number.parseFloat(d.amount) || 0,
    status: d.status,
    // Use real on-chain address from JOIN; '—' if not yet assigned
    address: d.userAddress ?? '—',
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

// Amount presets: null = all, then cycle through ranges (inclusive min)
const AMOUNT_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: '>$100', min: 100 },
  { label: '>$1k', min: 1000 },
  { label: '>$10k', min: 10_000 },
  { label: '<$100', max: 100 },
];

// Date presets: offset in days from today
const DATE_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 1 },
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
];

export function DepositsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const rt = useRealtime();
  const [tab, setTab] = useState<StatusTab>('all');
  const [chainFilter, setChainFilter] = useState<'bnb' | 'sol' | null>(null);
  const [tokenFilter, setTokenFilter] = useState<'USDT' | 'USDC' | null>(null);
  const [amountPreset, setAmountPreset] = useState<number | null>(null); // index into AMOUNT_PRESETS
  const [datePreset, setDatePreset] = useState<number | null>(null); // index into DATE_PRESETS
  const [selected, setSelected] = useState<FixDeposit | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [manualCreditOpen, setManualCreditOpen] = useState(false);

  useDepositSocketListener();

  const amountFilter = amountPreset !== null ? AMOUNT_PRESETS[amountPreset] : null;
  const dateFilter = datePreset !== null ? DATE_PRESETS[datePreset] : null;
  const dateFrom = dateFilter
    ? new Date(Date.now() - dateFilter.days * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  const { data, refetch, isLoading } = useDeposits({
    page,
    limit: PAGE_SIZE,
    status: tab === 'all' ? undefined : tab,
    chain: chainFilter ?? undefined,
    token: tokenFilter ?? undefined,
    minAmount: amountFilter?.min,
    maxAmount: amountFilter?.max,
    dateFrom,
  });

  // Map real API data to table shape; empty array when loading or no data.
  const deposits: FixDeposit[] = useMemo(() => {
    if (data?.data && data.data.length > 0) return data.data.map(toFix);
    return [];
  }, [data]);

  // Server already filters by status/chain/token/amount/date — client-side pass
  // only removes any residual mismatches (should be a no-op in practice).
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
  }, [tab, chainFilter, tokenFilter, amountPreset, datePreset]);

  // Use server-side total to compute pages so pagination reflects all records,
  // not just the current fetched slice (API returns PAGE_SIZE rows at a time).
  const serverTotal = data?.total ?? filtered.length;
  const totalPages = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
  const pageRows = filtered;

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
          <Filter
            label={t('deposits.fAmount')}
            value={amountPreset !== null ? AMOUNT_PRESETS[amountPreset]?.label : undefined}
            active={amountPreset !== null}
            onClick={() =>
              setAmountPreset((p) =>
                p === null ? 0 : p < AMOUNT_PRESETS.length - 1 ? p + 1 : null
              )
            }
            onClear={() => setAmountPreset(null)}
          />
          <Filter
            label={t('deposits.fDate')}
            value={datePreset !== null ? DATE_PRESETS[datePreset]?.label : undefined}
            active={datePreset !== null}
            onClick={() =>
              setDatePreset((p) => (p === null ? 0 : p < DATE_PRESETS.length - 1 ? p + 1 : null))
            }
            onClear={() => setDatePreset(null)}
          />
          <span className="text-xs text-muted text-mono">
            {filtered.length}/{serverTotal}
          </span>
        </div>

        <DepositsTable rows={pageRows} onSelect={setSelected} />

        <div className="pagination">
          <span>
            {t('deposits.showing')} {serverTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, serverTotal)} {t('deposits.of')} {serverTotal}
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
