import { useAuth } from '@/auth/use-auth';
import { Address, ChainPill, StatusBadge, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import { fmtCompact, fmtUSD } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';
// Multisig queue page — prototype visual port. Covers Safe/Squads vault
// headers, treasurer pool, pending/failed tabs, op detail sheet.
import { useMemo, useState } from 'react';
import { TOTAL_BALANCES } from '../_shared/fixtures';
import { FIX_MULTISIG_OPS, TREASURERS } from '../_shared/fixtures-flows';
import { BlockTicker, LiveDot, LiveTimeAgo } from '../_shared/realtime';
import { useWithdrawalsSocketListener } from '../withdrawals/use-withdrawals';
import { MultisigSheet } from './multisig-sheet';
import { TreasurerTeamCard, VaultCard } from './vault-card';

type Op = (typeof FIX_MULTISIG_OPS)[number];
type Tab = 'pending' | 'failed';

export function MultisigPage() {
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
    <div className="page page-dense">
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

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Governance · <span className="env-inline">co-signing</span>
          </div>
          <h1 className="page-title">Multisig</h1>
        </div>
        <div className="page-actions">
          <span className="meta-hint text-xs text-muted">
            <LiveDot /> last sync <LiveTimeAgo at={new Date(Date.now() - 18000).toISOString()} />
          </span>
          <button className="btn btn-secondary" onClick={doSync} disabled={syncing}>
            <I.Refresh
              size={13}
              style={syncing ? { animation: 'spin 700ms linear infinite' } : undefined}
            />
            Sync now
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Clock size={10} />
            Collecting
          </div>
          <div className="kpi-mini-value">
            {ops.filter((o) => o.status === 'collecting').length}
          </div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">
              $
              {fmtCompact(
                ops.filter((o) => o.status === 'collecting').reduce((s, o) => s + o.amount, 0)
              )}
            </span>
            <span className="badge-tight warn">
              <span className="dot" />
              signing
            </span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Check size={10} />
            Ready to execute
          </div>
          <div className="kpi-mini-value">{ops.filter((o) => o.status === 'ready').length}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">threshold met</span>
            <span className="badge-tight ok">
              <span className="dot" />
              ready
            </span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Users size={10} />
            Treasurers
          </div>
          <div className="kpi-mini-value">{TREASURERS.length}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted">all active</span>
            <span className="badge-tight ok">
              <span className="dot" />
              online
            </span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.UserX size={10} />
            Rejected · 30d
          </div>
          <div className="kpi-mini-value">{failed.length}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted">
              {failed.length === 0 ? 'no rejections' : 'review required'}
            </span>
          </div>
        </div>
      </div>

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

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'pending', label: 'Pending', count: pending.length },
              { value: 'failed', label: 'Failed', count: failed.length },
            ]}
          />
          <div className="spacer" />
          <span className="text-xs text-muted text-mono">{list.length} ops</span>
        </div>
        <table className="table table-tight">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Vault</th>
              <th className="num">Amount</th>
              <th>Destination</th>
              <th>Approvals</th>
              <th>Status</th>
              <th className="num">Nonce</th>
              <th className="num">Expires</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="table-empty">
                    <div className="table-empty-title">No operations</div>
                    <div className="text-sm">New co-signing operations appear here.</div>
                  </div>
                </td>
              </tr>
            ) : (
              list.map((op) => (
                <tr key={op.id} onClick={() => setSelected(op)} style={{ cursor: 'pointer' }}>
                  <td className="text-mono fw-500">{op.id}</td>
                  <td>
                    <div className="hstack">
                      <ChainPill chain={op.chain} />
                      <span className="text-sm">{op.safeName}</span>
                    </div>
                  </td>
                  <td className="num text-mono fw-500">
                    {fmtUSD(op.amount)} <span className="text-faint text-xs">{op.token}</span>
                  </td>
                  <td>
                    <Address value={op.destination} chain={op.chain} />
                  </td>
                  <td>
                    <div className="approval-row">
                      {Array.from({ length: op.total }, (_, j) => (
                        <div
                          key={j}
                          className={`approval-pip ${j < op.collected ? 'approved' : 'pending'}`}
                        >
                          {j < op.collected ? <I.Check size={9} /> : ''}
                        </div>
                      ))}
                      <span className="approval-text">
                        {op.collected}/{op.required}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={op.status} />
                  </td>
                  <td className="num text-mono">{op.nonce}</td>
                  <td className="num text-xs text-muted text-mono">in 5h 42m</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MultisigSheet
        op={selected}
        onClose={() => setSelected(null)}
        onApprove={onApprove}
        onReject={onReject}
        onExecute={onExecute}
      />
    </div>
  );
}
