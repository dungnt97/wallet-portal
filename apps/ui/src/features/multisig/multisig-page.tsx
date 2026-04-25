// Multisig queue page — wired to real /multisig-ops + /staff + /cold/balances + /wallets APIs.
// FIX_MULTISIG_OPS, TOTAL_BALANCES, TREASURERS fixtures fully removed.
import { ApiError } from '@/api/client';
import {
  useApproveMultisigOp,
  useColdBalances,
  useExecuteMultisigOp,
  useMultisigOps,
  useMultisigSyncStatus,
  useRefreshMultisigSync,
  useRejectMultisigOp,
  useStaffList,
  useWallets,
} from '@/api/queries';
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
  const safeName = op.chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault'; // i18n in VaultCard

  return {
    id: op.id,
    withdrawalId: op.withdrawalId,
    chain: op.chain,
    operationType: op.operationType,
    multisigAddr: op.multisigAddr,
    safeName,
    // M6 fix: use real withdrawal fields when op is linked to a withdrawal;
    // non-withdrawal ops (signer_add, rebalance, etc.) leave these null — UI shows N/A.
    amount: op.withdrawalAmount != null ? Number(op.withdrawalAmount) : 0,
    token: (op.withdrawalToken as 'USDT' | 'USDC' | null) ?? null,
    destination: op.withdrawalDestination ?? op.multisigAddr,
    nonce: op.withdrawalNonce ?? 0,
    required: op.requiredSigs,
    // M6 fix: use real totalSigners from API (counted from staff_signing_keys)
    total: op.totalSigners ?? op.requiredSigs,
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
  const [selected, setSelected] = useState<MultisigOpDisplay | null>(null);
  const [overrides, setOverrides] = useState<Record<string, MultisigOpDisplay>>({});

  // Real data
  const { data: opsPage } = useMultisigOps({ limit: 50 });
  const { data: syncStatus } = useMultisigSyncStatus();
  const refreshSync = useRefreshMultisigSync();
  const { data: staffPage } = useStaffList({ limit: 100 });
  const { data: coldBalances } = useColdBalances();
  // Vault addresses from wallet registry (operational wallets per chain)
  const { data: walletsPage } = useWallets({ tier: 'hot' });

  // Derive vault addresses from registry; fall back to env-configured values
  const bnbVaultAddress = useMemo(() => {
    return (
      walletsPage?.data.find((w) => w.chain === 'bnb' && w.purpose === 'operational')?.address ??
      (import.meta.env.VITE_SAFE_ADDRESS as string | undefined) ??
      '—'
    );
  }, [walletsPage]);

  const solVaultAddress = useMemo(() => {
    return (
      walletsPage?.data.find((w) => w.chain === 'sol' && w.purpose === 'operational')?.address ??
      (import.meta.env.VITE_SQUADS_MULTISIG_ADDRESS as string | undefined) ??
      '—'
    );
  }, [walletsPage]);

  const staffMap = useMemo<Map<string, StaffMemberRow>>(() => {
    const m = new Map<string, StaffMemberRow>();
    for (const s of staffPage?.data ?? []) m.set(s.id, s);
    return m;
  }, [staffPage]);

  const treasurers = useMemo(
    () => (staffPage?.data ?? []).filter((s) => s.role === 'treasurer'),
    [staffPage]
  );

  /** Count of treasurers with lastLoginAt < 5 min ago (online presence) */
  const onlineTreasurerCount = useMemo<number | null>(() => {
    if (!staffPage) return null;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return treasurers.filter((t) => {
      if (!t.lastLoginAt) return false;
      return new Date(t.lastLoginAt).getTime() > fiveMinAgo;
    }).length;
  }, [staffPage, treasurers]);

  const bnbBalance = useMemo(() => {
    if (!coldBalances) return 0;
    return coldBalances
      .filter((b) => b.chain === 'bnb')
      .reduce((sum, b) => sum + Number.parseFloat(b.balance) / 1e18, 0);
  }, [coldBalances]);

  const solBalance = useMemo(() => {
    if (!coldBalances) return 0;
    return coldBalances
      .filter((b) => b.chain === 'sol')
      .reduce((sum, b) => sum + Number.parseFloat(b.balance) / 1e6, 0);
  }, [coldBalances]);

  const ops: MultisigOpDisplay[] = useMemo(() => {
    const base = (opsPage?.data ?? []).map((o) => apiOpToDisplay(o, staffMap));
    return base.map((o) => overrides[o.id] ?? o);
  }, [opsPage, staffMap, overrides]);

  const pending = ops.filter((o) => o.status === 'collecting' || o.status === 'ready');
  const failed = ops.filter((o) => o.status === 'failed' || o.status === 'expired');
  const list = tab === 'pending' ? pending : failed;

  const doSync = () => {
    refreshSync.mutate(undefined, {
      onSuccess: () => {
        // Invalidate cold + wallets after sync-refresh so balances re-fetch too
        void qc.invalidateQueries({ queryKey: ['cold'] });
        void qc.invalidateQueries({ queryKey: ['wallets'] });
        toast(t('multisig.synced', 'RPC re-probed — sync status updated.'), 'success');
      },
      onError: () => {
        toast(t('multisig.syncFailed', 'Sync probe failed — check RPC connectivity.'), 'error');
      },
    });
  };

  // Mutation hooks are keyed by selected op id
  const approveMutation = useApproveMultisigOp(selected?.id ?? 'none');
  const rejectMutation = useRejectMultisigOp(selected?.id ?? 'none');
  const executeMutation = useExecuteMultisigOp(selected?.id ?? 'none');

  const onApprove = (o: MultisigOpDisplay) => {
    if (!staff) return;
    approveMutation.mutate(
      { staffId: staff.id, at: new Date().toISOString() },
      {
        onSuccess: (result) => {
          const collected = result.op.collectedSigs;
          const updated: MultisigOpDisplay = {
            ...o,
            collected,
            status: result.op.status as MultisigOpDisplay['status'],
            approvers: [
              ...o.approvers,
              { staffId: staff.id, at: new Date().toISOString(), txSig: '' },
            ],
          };
          setOverrides((prev) => ({ ...prev, [o.id]: updated }));
          setSelected(updated);
          toast(`Signature recorded (${collected}/${o.required}).`, 'success');
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : String(err);
          toast(`Approve failed: ${msg}`, 'error');
        },
      }
    );
  };

  const onReject = (o: MultisigOpDisplay) => {
    if (!staff) return;
    rejectMutation.mutate(
      {},
      {
        onSuccess: () => {
          const updated: MultisigOpDisplay = { ...o, status: 'failed', rejectedBy: staff.id };
          setOverrides((prev) => ({ ...prev, [o.id]: updated }));
          setSelected(updated);
          toast(`Rejected ${o.id.slice(0, 8)}.`, 'success');
        },
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : String(err);
          toast(`Reject failed: ${msg}`, 'error');
        },
      }
    );
  };

  const onExecute = (o: MultisigOpDisplay) => {
    executeMutation.mutate(undefined, {
      onSuccess: () => {
        const updated: MultisigOpDisplay = { ...o, status: 'ready' };
        setOverrides((prev) => ({ ...prev, [o.id]: updated }));
        setSelected(null);
        toast(t('multisig.executeQueued', 'Broadcast enqueued.'), 'success');
      },
      onError: (err) => {
        const msg = err instanceof ApiError ? err.message : String(err);
        toast(`Execute failed: ${msg}`, 'error');
      },
    });
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
            <span className="text-muted">{t('multisig.threshold')}</span>
            <span className="fw-600">
              {MULTISIG_POLICY.required} of {MULTISIG_POLICY.total}
            </span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">{t('multisig.bscSafe')}</span>
            <LiveDot
              variant={
                syncStatus?.bnb.status === 'synced'
                  ? 'ok'
                  : syncStatus?.bnb.status === 'stale'
                    ? 'warn'
                    : 'err'
              }
            />
            <span className="fw-600">
              {syncStatus?.bnb.status ?? '…'}
              {syncStatus?.bnb.nonce !== undefined && (
                <span className="text-faint text-xs"> #{syncStatus.bnb.nonce}</span>
              )}
            </span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">{t('multisig.solSquads')}</span>
            <LiveDot
              variant={
                syncStatus?.sol.status === 'synced'
                  ? 'ok'
                  : syncStatus?.sol.status === 'stale'
                    ? 'warn'
                    : 'err'
              }
            />
            <span className="fw-600">{syncStatus?.sol.status ?? '…'}</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        <>
          <span className="meta-hint text-xs text-muted">
            <LiveDot
              variant={
                syncStatus?.bnb.status === 'synced' && syncStatus?.sol.status === 'synced'
                  ? 'ok'
                  : syncStatus?.bnb.status === 'error' || syncStatus?.sol.status === 'error'
                    ? 'err'
                    : 'warn'
              }
            />{' '}
            {t('multisig.lastSync')}{' '}
            {syncStatus ? (
              <LiveTimeAgo
                at={
                  syncStatus.bnb.lastSyncAt < syncStatus.sol.lastSyncAt
                    ? syncStatus.bnb.lastSyncAt
                    : syncStatus.sol.lastSyncAt
                }
              />
            ) : (
              '…'
            )}
          </span>
          <button className="btn btn-secondary" onClick={doSync} disabled={refreshSync.isPending}>
            <I.Refresh
              size={13}
              style={
                refreshSync.isPending ? { animation: 'spin 700ms linear infinite' } : undefined
              }
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
          onlineTreasurerCount={onlineTreasurerCount}
        />
      }
    >
      <div className="dash-grid-2" style={{ marginTop: 14 }}>
        <VaultCard
          chain="bnb"
          name={t('multisig.bnbVaultName')}
          address={bnbVaultAddress}
          policy={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total}`}
          balance={bnbBalance}
          pending={pending.filter((o) => o.chain === 'bnb').length}
          signers={treasurers}
        />
        <VaultCard
          chain="sol"
          name={t('multisig.solVaultName')}
          address={solVaultAddress}
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
