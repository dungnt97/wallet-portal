import { useAuth } from '@/auth/use-auth';
import { PageFrame } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import { useQueryClient } from '@tanstack/react-query';
// Multisig queue page — prototype visual port.
// Composed of split sub-components (kpi strip, vault cards, ops table, sheet).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TOTAL_BALANCES } from '../_shared/fixtures';
import { FIX_MULTISIG_OPS } from '../_shared/fixtures';
import { BlockTicker, LiveDot, LiveTimeAgo } from '../_shared/realtime';
import { useWithdrawalsSocketListener } from '../withdrawals/use-withdrawals';
import { MultisigKpiStrip } from './multisig-kpi-strip';
import { MultisigOpsTable } from './multisig-ops-table';
import { MultisigSheet } from './multisig-sheet';
import { TreasurerTeamCard, VaultCard } from './vault-card';

type Op = (typeof FIX_MULTISIG_OPS)[number];
type Tab = 'pending' | 'failed';

export function MultisigPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { staff } = useAuth();
  useWithdrawalsSocketListener();

  const [tab, setTab] = useState<Tab>('pending');
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Op | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Op>>({});

  const ops: Op[] = useMemo(() => FIX_MULTISIG_OPS.map((o) => overrides[o.id] ?? o), [overrides]);
  const pending = ops.filter((o) => o.status === 'collecting' || o.status === 'ready');
  const failed = ops.filter((o) => o.status === 'failed');
  const list = tab === 'pending' ? pending : failed;

  const doSync = () => {
    setSyncing(true);
    void qc.invalidateQueries({ queryKey: ['multisig'] });
    setTimeout(() => {
      setSyncing(false);
      toast('Synced with Safe and Squads.', 'success');
    }, 800);
  };

  const onApprove = (o: Op) => {
    if (!staff) return;
    const collected = o.collected + 1;
    const updated: Op = {
      ...o,
      collected,
      status: collected >= o.required ? 'ready' : 'collecting',
      approvers: [
        ...o.approvers,
        { staffId: staff.id, at: new Date().toISOString(), txSig: 'stub…' },
      ],
    };
    setOverrides((prev) => ({ ...prev, [o.id]: updated }));
    setSelected(updated);
    toast(`Signature recorded (${collected}/${o.required}).`, 'success');
  };

  const onReject = (o: Op) => {
    if (!staff) return;
    const updated: Op = { ...o, status: 'failed', rejectedBy: staff.id };
    setOverrides((prev) => ({ ...prev, [o.id]: updated }));
    setSelected(updated);
    toast(`Rejected ${o.id}.`, 'success');
  };

  const onExecute = (o: Op) => {
    const updated: Op = { ...o, status: 'ready' };
    setOverrides((prev) => ({ ...prev, [o.id]: updated }));
    setSelected(null);
  };

  return (
    <PageFrame
      eyebrow={
        <>
          {t('multisig.eyebrow')} · <span className="env-inline">{t('multisig.subtitle')}</span>
        </>
      }
      title={t('multisig.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Shield size={11} />
            <span className="text-muted">Threshold:</span>
            <span className="fw-600">
              {MULTISIG_POLICY.required} of {MULTISIG_POLICY.total}
            </span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">BSC Safe:</span>
            <LiveDot />
            <span className="fw-600">synced</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">SOL Squads:</span>
            <LiveDot />
            <span className="fw-600">synced</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> last sync <LiveTimeAgo at={new Date(Date.now() - 18000).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doSync} disabled={syncing}>
            <I.Refresh
              size={13}
              style={syncing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
            {t('common.retry')}
          </button>
        </>
      }
      kpis={<MultisigKpiStrip ops={ops} failedCount={failed.length} />}
    >
      <div className="dash-grid-2" style={{ marginTop: 14 }}>
        <VaultCard
          chain="bnb"
          name="BSC Treasury Safe"
          address="0x4a8C2bAcF8dE54E2B19f2Aab1ce8B7bc1D54aB17"
          policy={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total}`}
          balance={TOTAL_BALANCES.bnb.USDT + TOTAL_BALANCES.bnb.USDC}
          pending={pending.filter((o) => o.chain === 'bnb').length}
        />
        <VaultCard
          chain="sol"
          name="Solana Squads Vault"
          address="GfA8T9LqXk2pNvRtBcMnHWdYJsEqZxuVP3oHkCmVault7"
          policy={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total}`}
          balance={TOTAL_BALANCES.sol.USDT + TOTAL_BALANCES.sol.USDC}
          pending={pending.filter((o) => o.chain === 'sol').length}
        />
      </div>

      <TreasurerTeamCard />

      <MultisigOpsTable
        tab={tab}
        onTabChange={setTab}
        pendingCount={pending.length}
        failedCount={failed.length}
        list={list}
        onSelect={setSelected}
      />

      <MultisigSheet
        op={selected}
        onClose={() => setSelected(null)}
        onApprove={onApprove}
        onReject={onReject}
        onExecute={onExecute}
      />
    </PageFrame>
  );
}
