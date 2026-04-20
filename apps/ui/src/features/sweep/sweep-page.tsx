import { connectSocket, disconnectSocket } from '@/api/socket';
import { Segmented } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useQueryClient } from '@tanstack/react-query';
// Sweep page — prototype visual port. Uses fixtures until /sweeps endpoint lands.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIX_DEPOSIT_ADDRESSES, type FixSweepAddr } from '../_shared/fixtures';
import { minutesAgo } from '../_shared/helpers';
import { BlockTicker } from '../_shared/realtime';
import { GasMonitor } from './gas-monitor';
import { SweepAddressTable, SweepCart } from './sweep-address-table';
import { type Batch, SweepBatchHistory } from './sweep-batch-history';
import { SweepConfirmModal } from './sweep-confirm-modal';
import { SweepKpiStrip } from './sweep-kpi-strip';

const INITIAL_BATCHES: Batch[] = [
  {
    id: 'b_8112',
    chain: 'bnb',
    addresses: 6,
    total: 12_840.55,
    fee: 0.018,
    status: 'completed',
    createdAt: minutesAgo(120),
    executedAt: minutesAgo(115),
  },
  {
    id: 'b_8111',
    chain: 'sol',
    addresses: 4,
    total: 8_220.1,
    fee: 0.000012,
    status: 'completed',
    createdAt: minutesAgo(220),
    executedAt: minutesAgo(218),
  },
  {
    id: 'b_8104',
    chain: 'bnb',
    addresses: 6,
    total: 14_018.2,
    fee: 0.022,
    status: 'partial',
    createdAt: minutesAgo(96 * 60),
    executedAt: minutesAgo(96 * 60 - 2),
  },
];

export function SweepPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [batches, setBatches] = useState<Batch[]>(INITIAL_BATCHES);

  useEffect(() => {
    const socket = connectSocket();
    const handler = () => {
      void qc.invalidateQueries({ queryKey: ['sweep'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    socket.on('sweep.completed', handler);
    return () => {
      socket.off('sweep.completed', handler);
      disconnectSocket();
    };
  }, [qc]);

  const filtered = useMemo(() => FIX_DEPOSIT_ADDRESSES.filter((a) => a.chain === chain), [chain]);
  const selectedAddrs = filtered.filter((a) => selected.includes(a.id));
  const totalUSDT = selectedAddrs.reduce((s, a) => s + a.balanceUSDT, 0);
  const totalUSDC = selectedAddrs.reduce((s, a) => s + a.balanceUSDC, 0);
  const total = totalUSDT + totalUSDC;
  const estFee = chain === 'bnb' ? selectedAddrs.length * 0.0014 : selectedAddrs.length * 0.000005;
  const readyTotal = filtered.reduce((s, a) => s + a.balanceUSDT + a.balanceUSDC, 0);

  const toggleSelect = (id: string | number) =>
    setSelected((s) =>
      s.includes(String(id)) ? s.filter((x) => x !== String(id)) : [...s, String(id)]
    );
  const toggleAll = (on: boolean) => setSelected(on ? filtered.map((a) => a.id) : []);
  const selectAboveThreshold = () =>
    setSelected(filtered.filter((a) => a.balanceUSDT + a.balanceUSDC > 500).map((a) => a.id));

  const executeBatch = () => {
    setExecuting(true);
    setTimeout(() => {
      const newBatch: Batch = {
        id: `b_${8113 + batches.length}`,
        chain,
        addresses: selectedAddrs.length,
        total,
        fee: estFee,
        status: 'completed',
        createdAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
      };
      setBatches([newBatch, ...batches]);
      setSelected([]);
      setConfirmOpen(false);
      setExecuting(false);
      toast(t('sweep.toastBroadcast', { id: newBatch.id }), 'success');
    }, 1800);
  };

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Sweep size={11} />
          <span className="text-muted">{t('sweep.policyLabel')}</span>
          <span className="fw-600">{t('sweep.policyValue')}</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Lightning size={11} />
          <span className="text-muted">{t('sweep.gasTopupLabel')}</span>
          <span className="fw-600">{t('sweep.gasTopupValue')}</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">{t('sweep.idempotencyLabel')}</span>
          <span className="fw-600">{t('sweep.idempotencyValue')}</span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            {t('sweep.eyebrow')} · <span className="env-inline">{t('sweep.subEyebrow')}</span>
          </div>
          <h1 className="page-title">{t('sweep.title')}</h1>
        </div>
        <div className="page-actions">
          <Segmented
            options={[
              { value: 'bnb', label: 'BNB Chain' },
              { value: 'sol', label: 'Solana' },
            ]}
            value={chain}
            onChange={(v) => {
              setChain(v);
              setSelected([]);
            }}
          />
        </div>
      </div>

      <SweepKpiStrip
        chain={chain}
        readyTotal={readyTotal}
        readyCount={filtered.length}
        selectedCount={selectedAddrs.length}
        selectedTotal={total}
        estFee={estFee}
        latest={batches[0]}
      />

      <GasMonitor chain={chain} />

      <div className="alert info" style={{ margin: '14px 0' }}>
        <I.Info size={14} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">{t('sweep.policyAlertTitle')}</div>
          <div className="alert-text">
            {chain === 'bnb' ? t('sweep.policyAlertBnb') : t('sweep.policyAlertSol')}
          </div>
        </div>
      </div>

      <div className="sweep-grid">
        <SweepAddressTable
          rows={filtered}
          chain={chain}
          selected={selected}
          onToggle={toggleSelect}
          onToggleAll={toggleAll}
          selectAboveThreshold={selectAboveThreshold}
        />
        <SweepCart
          selected={selectedAddrs as FixSweepAddr[]}
          totalUSDT={totalUSDT}
          totalUSDC={totalUSDC}
          total={total}
          estFee={estFee}
          chain={chain}
          onExecute={() => setConfirmOpen(true)}
        />
      </div>

      <SweepBatchHistory batches={batches} />

      <SweepConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        executing={executing}
        chain={chain}
        addressesCount={selectedAddrs.length}
        totalUSDT={totalUSDT}
        totalUSDC={totalUSDC}
        total={total}
        estFee={estFee}
        onConfirm={executeBatch}
      />
    </div>
  );
}
