// Transactions — unified on-chain tx log. Wired to real /transactions API.
// FIX_TRANSACTIONS_FULL + FixTransaction fixture fully removed.
import { useTransactions } from '@/api/queries';
import type { TxRow, TxType } from '@/api/queries';
import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadCSV } from '../_shared/helpers';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { TransactionsKpiStrip } from './transactions-kpi-strip';
import { TransactionSheet } from './transactions-sheet';
import { TransactionsTable } from './transactions-table';

type TxTab = 'all' | TxType;
const PAGE_SIZE = 25;

export function TransactionsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const rt = useRealtime();

  const [tab, setTab] = useState<TxTab>('all');
  const [chain, setChain] = useState<'bnb' | 'sol' | null>(null);
  const [status, setStatus] = useState<'confirmed' | 'pending' | 'failed' | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<TxRow | null>(null);

  // Reset to page 1 whenever filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter signature only
  useEffect(() => {
    setPage(1);
  }, [tab, chain, status]);

  const { data, isLoading } = useTransactions({
    page,
    limit: PAGE_SIZE,
    type: tab !== 'all' ? tab : undefined,
    chain: chain ?? undefined,
    status: status ?? undefined,
  });

  const rows: TxRow[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // KPI strip uses the current page rows — real totals require a separate aggregate endpoint
  // which doesn't exist yet; for now we show aggregates over the loaded page.
  const allRows = rows;

  const doRefresh = () => {
    setRefreshing(true);
    void qc.invalidateQueries({ queryKey: ['transactions'] });
    setTimeout(() => {
      setRefreshing(false);
      toast('Refreshed.', 'success');
    }, 700);
  };

  const doExport = () => {
    downloadCSV(
      'transactions.csv',
      rows.map((tx) => [
        tx.id,
        tx.type,
        tx.chain,
        tx.token,
        tx.amount,
        tx.from,
        tx.to,
        tx.txHash,
        tx.blockNumber,
        tx.status,
        tx.fee,
        tx.timestamp,
      ]),
      [
        'id',
        'type',
        'chain',
        'token',
        'amount',
        'from',
        'to',
        'hash',
        'block',
        'status',
        'fee',
        'timestamp',
      ]
    );
    toast(`Exported ${rows.length} rows.`, 'success');
  };

  return (
    <PageFrame
      eyebrow={
        <>
          Ledger · <span className="env-inline">{t('transactions.subtitle')}</span>
        </>
      }
      title={t('transactions.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Logs size={11} />
            <span className="text-muted">Ledger:</span>
            <span className="fw-600">unified · append-only</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Activity size={11} />
            <span className="text-muted">Indexer:</span>
            <LiveDot />
            <span className="fw-600">synced</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">Retention:</span>
            <span className="fw-600">7y · immutable</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> Live · updated <LiveTimeAgo at={new Date(rt.now - 1500).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doExport} disabled={rows.length === 0}>
            <I.External size={13} /> {t('common.exportCsv')}
          </button>
          <button className="btn btn-secondary" onClick={doRefresh} disabled={refreshing}>
            <I.Refresh
              size={13}
              style={refreshing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
          </button>
        </>
      }
      kpis={<TransactionsKpiStrip rows={allRows} />}
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as TxTab)}
            embedded
            tabs={[
              { value: 'all', label: 'All', count: total },
              { value: 'deposit', label: 'Deposits' },
              { value: 'sweep', label: 'Sweeps' },
              { value: 'withdrawal', label: 'Withdrawals' },
            ]}
          />
          <div className="spacer" />
          <Filter
            label="Chain"
            value={chain ? CHAINS[chain].short : undefined}
            active={!!chain}
            onClick={() => setChain(chain === 'bnb' ? 'sol' : chain === 'sol' ? null : 'bnb')}
            onClear={() => setChain(null)}
          />
          <Filter
            label="Status"
            value={status ?? undefined}
            active={!!status}
            onClick={() =>
              setStatus(
                status === 'confirmed'
                  ? 'pending'
                  : status === 'pending'
                    ? 'failed'
                    : status === 'failed'
                      ? null
                      : 'confirmed'
              )
            }
            onClear={() => setStatus(null)}
          />
          <Filter label="Date" />
          <Filter label="Asset" />
          <span className="text-xs text-muted text-mono">{isLoading ? '…' : total}</span>
        </div>
        <TransactionsTable
          rows={rows}
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onSelect={setSelected}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>

      <TransactionSheet tx={selected} onClose={() => setSelected(null)} />
    </PageFrame>
  );
}
