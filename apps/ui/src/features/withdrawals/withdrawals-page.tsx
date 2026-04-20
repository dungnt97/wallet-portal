import { useAuth } from '@/auth/use-auth';
import { Filter, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { MULTISIG_POLICY, ROLES } from '@/lib/constants';
// Withdrawals page — prototype visual + RBAC gating. Signing flow is stubbed
// (toast-only) until Pass 4 ports the full signing modals.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FixWithdrawal } from '../_shared/fixtures';
import { downloadCSV } from '../_shared/helpers';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';
import { SigningFlowHost, useSigningFlow, withdrawalToOp } from '../signing';
import { NewWithdrawalForm } from './new-withdrawal-form';
import { useWithdrawals, useWithdrawalsSocketListener } from './use-withdrawals';
import { WithdrawalsKpiStrip } from './withdrawals-kpi-strip';
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
  const { data } = useWithdrawals();
  const signingFlow = useSigningFlow();
  // Track the withdrawal whose signing is in progress so we can update
  // local overrides once the broadcast lands.
  const [pendingSignWithdrawal, setPendingSignWithdrawal] = useState<FixWithdrawal | null>(null);

  const [tab, setTab] = useState<Tab>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<FixWithdrawal | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, FixWithdrawal>>({});

  // Apply any in-memory updates (optimistic approval / exec / reject)
  const list: FixWithdrawal[] = useMemo(() => {
    const base = data ?? [];
    return base.map((w) => localOverrides[w.id] ?? w);
  }, [data, localOverrides]);

  const filtered = list.filter((w) =>
    tab === 'all'
      ? true
      : tab === 'pending'
        ? w.stage === 'awaiting_signatures' || w.stage === 'executing' || w.stage === 'draft'
        : w.stage === tab
  );
  const counts = {
    all: list.length,
    pending: list.filter(
      (w) => w.stage === 'awaiting_signatures' || w.stage === 'executing' || w.stage === 'draft'
    ).length,
    completed: list.filter((w) => w.stage === 'completed').length,
    failed: list.filter((w) => w.stage === 'failed').length,
  };

  // Stub flow: mark approved / rejected / executed in local state only.
  const addOverride = (w: FixWithdrawal) => setLocalOverrides((prev) => ({ ...prev, [w.id]: w }));

  const onApprove = (w: FixWithdrawal) => {
    if (!staff) return;
    setPendingSignWithdrawal(w);
    signingFlow.start(withdrawalToOp(w));
  };

  // Called once signing flow reaches "done" (post-broadcast).
  const onSigningComplete = () => {
    const w = pendingSignWithdrawal;
    if (!w || !staff) return;
    const nextCount = w.multisig.collected + 1;
    const threshold = nextCount >= w.multisig.required;
    const updated: FixWithdrawal = {
      ...w,
      stage: threshold ? 'completed' : 'awaiting_signatures',
      multisig: {
        ...w.multisig,
        collected: nextCount,
        approvers: [
          ...w.multisig.approvers,
          {
            staffId: staff.id,
            at: new Date().toISOString(),
            txSig: signingFlow.state.signature?.signature.slice(0, 12) ?? 'sig…',
          },
        ],
      },
      txHash: threshold ? (signingFlow.state.broadcast?.hash ?? w.txHash) : w.txHash,
    };
    addOverride(updated);
    setSelected(updated);
    setPendingSignWithdrawal(null);
    toast(
      threshold ? `${w.id} signed and broadcast on-chain.` : `${w.id} co-signature recorded.`,
      'success'
    );
  };

  const onSigningRejected = () => {
    const w = pendingSignWithdrawal;
    setPendingSignWithdrawal(null);
    if (!w || !staff) return;
    const updated: FixWithdrawal = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(`Rejected ${w.id}.`, 'success');
  };

  const onReject = (w: FixWithdrawal) => {
    if (!staff) return;
    const updated: FixWithdrawal = {
      ...w,
      stage: 'failed',
      multisig: { ...w.multisig, rejectedBy: staff.id },
    };
    addOverride(updated);
    setSelected(updated);
    toast(`Rejected ${w.id}.`, 'success');
  };

  const onExecute = (w: FixWithdrawal) => {
    const updated: FixWithdrawal = { ...w, stage: 'completed', txHash: `stub_${w.id}` };
    addOverride(updated);
    setSelected(updated);
  };

  const onSubmitDraft = (w: FixWithdrawal) => {
    const updated: FixWithdrawal = { ...w, stage: 'awaiting_signatures' };
    addOverride(updated);
    setSelected(updated);
    toast(`${w.id} submitted to multisig.`, 'success');
  };

  const onNewSubmit = (w: FixWithdrawal) => {
    addOverride(w);
    setCreateOpen(false);
    toast(`Created ${w.id}.`, 'success');
  };

  const doExport = () => {
    downloadCSV(
      'withdrawals.csv',
      filtered.map((w) => [
        w.id,
        w.chain,
        w.token,
        w.amount,
        w.destination,
        w.requestedBy,
        w.stage,
        w.multisig.collected,
        w.multisig.required,
        w.createdAt,
        w.txHash || '',
      ]),
      [
        'id',
        'chain',
        'token',
        'amount',
        'destination',
        'requester',
        'stage',
        'collected',
        'required',
        'created',
        'hash',
      ]
    );
    toast(t('withdrawals.exportedRows', { n: filtered.length }), 'success');
  };

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Shield size={11} />
          <span className="text-muted">{t('withdrawals.policy')}</span>
          <span className="fw-600">
            {t('withdrawals.treasurers', { n: MULTISIG_POLICY.required, m: MULTISIG_POLICY.total })}
          </span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">{t('withdrawals.signer')}</span>
          <span className="fw-600">{t('withdrawals.hsmCosign')}</span>
          <LiveDot />
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Activity size={11} />
          <span className="text-muted">{t('withdrawals.broadcastQueue')}</span>
          <span className="fw-600 text-mono">{t('withdrawals.pendingCount', { n: 0 })}</span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            {t('withdrawals.eyebrow')} ·{' '}
            <span className="env-inline">{t('withdrawals.subEyebrow')}</span>
          </div>
          <h1 className="page-title">{t('withdrawals.title')}</h1>
        </div>
        <div className="page-actions">
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> {t('withdrawals.live')} · {t('withdrawals.updated')}{' '}
            <LiveTimeAgo at={new Date(rt.now - 2400).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> {t('withdrawals.exportCsv')}
          </button>
          {canCreate ? (
            <button className="btn btn-accent" onClick={() => setCreateOpen(true)}>
              <I.Plus size={13} /> {t('withdrawals.newWithdrawal')}
            </button>
          ) : (
            <button
              className="btn btn-accent"
              disabled
              title={t('withdrawals.cannotCreate', {
                role: ROLES[staff?.role ?? 'viewer']?.label ?? '',
              })}
            >
              <I.Lock size={13} /> {t('withdrawals.newWithdrawal')}
            </button>
          )}
        </div>
      </div>

      <WithdrawalsKpiStrip list={list} />

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
          <Filter label={t('withdrawals.fChain')} />
          <Filter label={t('withdrawals.fToken')} />
          <Filter label={t('withdrawals.fRequester')} />
          <Filter label={t('withdrawals.fDate')} />
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
    </div>
  );
}
