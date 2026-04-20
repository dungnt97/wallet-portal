// Transactions — unified on-chain tx log (deposits + withdrawals + sweeps).
// Ports prototype page_transactions.jsx. Split: kpi-strip + table + sheet.
import { Filter, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { useEffect, useMemo, useState } from 'react';
import { downloadCSV } from '../_shared/helpers';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { FIX_TRANSACTIONS_FULL, type FixTransaction } from './transactions-fixtures';
import { TransactionsKpiStrip } from './transactions-kpi-strip';
import { TransactionSheet } from './transactions-sheet';
import { TransactionsTable } from './transactions-table';

type TxTab = 'all' | 'deposit' | 'sweep' | 'withdrawal';
const PAGE_SIZE = 25;

export function TransactionsPage() {
  const toast = useToast();
  const rt = useRealtime();
  const [type, setType] = useState<TxTab>('all');
  const [chain, setChain] = useState<'bnb' | 'sol' | null>(null);
  const [status, setStatus] = useState<'confirmed' | 'pending' | 'failed' | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<FixTransaction | null>(null);

  const filtered = useMemo(
    () =>
      FIX_TRANSACTIONS_FULL.filter((t) => {
        if (type !== 'all' && t.type !== type) return false;
        if (chain && t.chain !== chain) return false;
        if (status && t.status !== status) return false;
        return true;
      }),
    [type, chain, status]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter signature only
  useEffect(() => {
    setPage(1);
  }, [type, chain, status]);

  const doRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast('Refreshed — no new transactions.');
    }, 700);
  };

  const doExport = () => {
    downloadCSV(
      'transactions.csv',
      filtered.map((t) => [
        t.id,
        t.type,
        t.chain,
        t.token,
        t.amount,
        t.from,
        t.to,
        t.txHash,
        t.blockNumber,
        t.status,
        t.fee,
        t.timestamp,
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
    toast(`Exported ${filtered.length} rows.`, 'success');
  };

  const deposits = FIX_TRANSACTIONS_FULL.filter((t) => t.type === 'deposit');
  const withdrawals = FIX_TRANSACTIONS_FULL.filter((t) => t.type === 'withdrawal');
  const sweeps = FIX_TRANSACTIONS_FULL.filter((t) => t.type === 'sweep');

  return (
    <div className="page page-dense">
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

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Ledger · <span className="env-inline">Unified</span>
          </div>
          <h1 className="page-title">Transactions</h1>
        </div>
        <div className="page-actions">
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> Live · updated <LiveTimeAgo at={new Date(rt.now - 1500).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={doRefresh} disabled={refreshing}>
            <I.Refresh
              size={13}
              style={refreshing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
          </button>
        </div>
      </div>

      <TransactionsKpiStrip rows={FIX_TRANSACTIONS_FULL} />

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={type}
            onChange={(v) => setType(v as TxTab)}
            embedded
            tabs={[
              { value: 'all', label: 'All', count: FIX_TRANSACTIONS_FULL.length },
              { value: 'deposit', label: 'Deposits', count: deposits.length },
              { value: 'sweep', label: 'Sweeps', count: sweeps.length },
              { value: 'withdrawal', label: 'Withdrawals', count: withdrawals.length },
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
          <span className="text-xs text-muted text-mono">{filtered.length}</span>
        </div>
        <TransactionsTable
          rows={pageRows}
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onSelect={setSelected}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </div>

      <TransactionSheet tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
