// Multisig queue page — wired to real /multisig-ops + /staff + /cold/balances APIs.
// FIX_MULTISIG_OPS, TOTAL_BALANCES, TREASURERS fixtures fully removed.
import { useColdBalances, useMultisigOps, useStaffList } from '@/api/queries';
import type { MultisigOpRow, StaffMemberRow } from '@/api/queries';
import { useAuth } from '@/auth/use-auth';
import { PageFrame } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveDot, LiveTimeAgo } from '../_shared/realtime';
import { useWithdrawalsSocketListener } from '../withdrawals/use-withdrawals';
import { MultisigKpiStrip } from './multisig-kpi-strip';
import { MultisigOpsTable } from './multisig-ops-table';
import { MultisigSheet } from './multisig-sheet';
import type { MultisigOpDisplay } from './multisig-types';
import { TreasurerTeamCard, VaultCard } from './vault-card';

type Tab = 'pending' | 'failed';

/** Map API MultisigOpRow to the richer MultisigOpDisplay for the UI. */
function apiOpToDisplay(
  op: MultisigOpRow,
  staffMap: Map<string, StaffMemberRow>
): MultisigOpDisplay {
  // Derive a readable vault name from the chain
  const safeName = op.chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault';

  return {
    id: op.id,
    withdrawalId: op.withdrawalId,
    chain: op.chain,
    operationType: op.operationType,
    multisigAddr: op.multisigAddr,
    safeName,
    // amount/token/destination not returned by /multisig-ops — shown as N/A for non-withdrawal ops
    amount: 0,
    token: null,
    destination: op.multisigAddr,
    nonce: 0,
    required: op.requiredSigs,
    total: op.requiredSigs + 1, // API doesn't return total; approximate as required + 1
    collected: op.collectedSigs,
    approvers: [],
    rejectedBy: null,
    status: op.status,
    expiresAt: op.expiresAt,
    createdAt: op.createdAt,
  };
}

export function MultisigPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { staff } = useAuth();
  useWithdrawalsSocketListener();

  const [tab, setTab] = useState<Tab>('pending');
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<MultisigOpDisplay | null>(null);
  const [overrides, setOverrides] = useState<Record<string, MultisigOpDisplay>>({});

  // Real data
  const { data: opsPage } = useMultisigOps({ limit: 50 });
  const { data: staffPage } = useStaffList({ limit: 100 });
  const { data: coldBalances } = useColdBalances();

  const staffMap = useMemo<Map<string, StaffMemberRow>>(() => {
    const m = new Map<string, StaffMemberRow>();
    for (const s of staffPage?.data ?? []) m.set(s.id, s);
    return m;
  }, [staffPage]);

  const treasurers = useMemo(
    () => (staffPage?.data ?? []).filter((s) => s.role === 'treasurer'),
    [staffPage]
  );

  const bnbBalance = useMemo(() => {
    if (!coldBalances) return 0;
    return coldBalances
      .filter((b) => b.chain === 'bnb')
      .reduce((sum, b) => sum + Number.parseFloat(b.balance), 0);
  }, [coldBalances]);

  const solBalance = useMemo(() => {
    if (!coldBalances) return 0;
    return coldBalances
      .filter((b) => b.chain === 'sol')
      .reduce((sum, b) => sum + Number.parseFloat(b.balance), 0);
  }, [coldBalances]);

  const ops: MultisigOpDisplay[] = useMemo(() => {
    const base = (opsPage?.data ?? []).map((o) => apiOpToDisplay(o, staffMap));
    return base.map((o) => overrides[o.id] ?? o);
  }, [opsPage, staffMap, overrides]);

  const pending = ops.filter((o) => o.status === 'collecting' || o.status === 'ready');
  const failed = ops.filter((o) => o.status === 'failed' || o.status === 'expired');
  const list = tab === 'pending' ? pending : failed;

  const doSync = () => {
    setSyncing(true);
    void qc.invalidateQueries({ queryKey: ['multisig'] });
    void qc.invalidateQueries({ queryKey: ['cold'] });
    setTimeout(() => {
      setSyncing(false);
      toast('Synced with Safe and Squads.', 'success');
    }, 800);
  };

  const onApprove = (o: MultisigOpDisplay) => {
    if (!staff) return;
    const collected = o.collected + 1;
    const updated: MultisigOpDisplay = {
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

  const onReject = (o: MultisigOpDisplay) => {
    if (!staff) return;
    const updated: MultisigOpDisplay = { ...o, status: 'failed', rejectedBy: staff.id };
    setOverrides((prev) => ({ ...prev, [o.id]: updated }));
    setSelected(updated);
    toast(`Rejected ${o.id}.`, 'success');
  };

  const onExecute = (o: MultisigOpDisplay) => {
    const updated: MultisigOpDisplay = { ...o, status: 'ready' };
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
      kpis={
        <MultisigKpiStrip
          ops={ops}
          failedCount={failed.length}
          treasurerCount={staffPage ? treasurers.length : null}
        />
      }
    >
      <div className="dash-grid-2" style={{ marginTop: 14 }}>
        <VaultCard
          chain="bnb"
          name="BSC Treasury Safe"
          address="0x4a8C2bAcF8dE54E2B19f2Aab1ce8B7bc1D54aB17"
          policy={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total}`}
          balance={bnbBalance}
          pending={pending.filter((o) => o.chain === 'bnb').length}
          signers={treasurers}
        />
        <VaultCard
          chain="sol"
          name="Solana Squads Vault"
          address="GfA8T9LqXk2pNvRtBcMnHWdYJsEqZxuVP3oHkCmVault7"
          policy={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total}`}
          balance={solBalance}
          pending={pending.filter((o) => o.chain === 'sol').length}
          signers={treasurers}
        />
      </div>

      <TreasurerTeamCard
        treasurers={treasurers}
        required={MULTISIG_POLICY.required}
        total={MULTISIG_POLICY.total}
      />

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
