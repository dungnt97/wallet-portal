import { PageFrame, Segmented } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
// Sweep page — real candidates via useSweepCandidates, trigger via useSweepTrigger.
// Fixture fallback removed: empty state shown when no candidates above threshold.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FixSweepAddr } from '../_shared/fixtures';
import { INITIAL_SWEEP_BATCHES } from '../_shared/fixtures';
import { GasMonitor } from './gas-monitor';
import { SweepAddressTable, SweepCart } from './sweep-address-table';
import { type Batch, SweepBatchHistory } from './sweep-batch-history';
import { SweepConfirmModal } from './sweep-confirm-modal';
import { SweepKpiStrip } from './sweep-kpi-strip';
import { SweepPolicyStrip } from './sweep-policy-strip';
import { useSweepSocketListener } from './sweep-socket-listener';
import { useSweepCandidates } from './use-sweep-candidates';
import { useSweepTrigger } from './use-sweep-trigger';

/** Map API SweepCandidate → FixSweepAddr shape expected by SweepAddressTable */
function toTableRow(c: {
  userAddressId: string;
  userId: string;
  chain: 'bnb' | 'sol';
  address: string;
  creditedUsdt: string;
  creditedUsdc: string;
}): FixSweepAddr {
  return {
    id: c.userAddressId,
    userId: c.userId,
    userName: `${c.address.slice(0, 8)}…`,
    chain: c.chain,
    address: c.address,
    balanceUSDT: Number(c.creditedUsdt),
    balanceUSDC: Number(c.creditedUsdc),
    gasBalance: 0,
    lastDepositAt: new Date().toISOString(),
  };
}

export function SweepPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batches] = useState<Batch[]>(INITIAL_SWEEP_BATCHES);

  // ── Real data ───────────────────────────────────────────────────────────────
  const { data: candidatesRes, isLoading } = useSweepCandidates(chain);
  const trigger = useSweepTrigger();

  // ── Live updates via Socket.io ──────────────────────────────────────────────
  useSweepSocketListener();

  // ── Derived state ───────────────────────────────────────────────────────────
  const candidates = candidatesRes?.data ?? [];
  const filtered: FixSweepAddr[] = useMemo(() => candidates.map(toTableRow), [candidates]);

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

  // ── Execute sweep batch ─────────────────────────────────────────────────────
  const executeBatch = async () => {
    try {
      const result = await trigger.mutateAsync({ candidate_ids: selected });
      setSelected([]);
      setConfirmOpen(false);
      const count = result.created.length;
      toast(t('sweep.broadcast.toast', { id: `(${count})` }), 'success');
    } catch {
      toast(t('sweep.error.generic'), 'error');
    }
  };

  return (
    <PageFrame
      eyebrow={
        <>
          {t('sweep.eyebrow')} · <span className="env-inline">{t('sweep.subEyebrow')}</span>
        </>
      }
      title={t('sweep.title')}
      policyStrip={<SweepPolicyStrip />}
      actions={
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
      }
      kpis={
        <SweepKpiStrip
          chain={chain}
          readyTotal={readyTotal}
          readyCount={filtered.length}
          selectedCount={selectedAddrs.length}
          selectedTotal={total}
          estFee={estFee}
          latest={batches[0]}
        />
      }
    >
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

      {isLoading ? (
        <div className="text-muted text-sm" style={{ padding: '24px 0' }}>
          Loading candidates…
        </div>
      ) : (
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
            selected={selectedAddrs}
            totalUSDT={totalUSDT}
            totalUSDC={totalUSDC}
            total={total}
            estFee={estFee}
            chain={chain}
            onExecute={() => setConfirmOpen(true)}
          />
        </div>
      )}

      <SweepBatchHistory batches={batches} />

      <SweepConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        executing={trigger.isPending}
        chain={chain}
        addressesCount={selectedAddrs.length}
        totalUSDT={totalUSDT}
        totalUSDC={totalUSDC}
        total={total}
        estFee={estFee}
        onConfirm={() => void executeBatch()}
      />
    </PageFrame>
  );
}
