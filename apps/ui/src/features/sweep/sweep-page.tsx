import { connectSocket, disconnectSocket } from '@/api/socket';
import { ChainPill, Segmented, StatusBadge } from '@/components/custody';
import { Modal, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtCompact, fmtUSD } from '@/lib/format';
import { useQueryClient } from '@tanstack/react-query';
// Sweep page — prototype visual port. Uses fixtures until /sweeps endpoint lands.
import { useEffect, useMemo, useState } from 'react';
import { FIX_DEPOSIT_ADDRESSES, type FixSweepAddr } from '../_shared/fixtures-flows';
import { minutesAgo } from '../_shared/helpers';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';
import { GasMonitor } from './gas-monitor';
import { SweepAddressTable, SweepCart } from './sweep-address-table';

interface Batch {
  id: string;
  chain: 'bnb' | 'sol';
  addresses: number;
  total: number;
  fee: number;
  status: 'completed' | 'partial';
  createdAt: string;
  executedAt: string;
}

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
  const toast = useToast();
  const qc = useQueryClient();
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [batches, setBatches] = useState<Batch[]>(INITIAL_BATCHES);

  // Subscribe to sweep.completed events
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
      toast(`Broadcast ${newBatch.id} sent.`, 'success');
    }, 1800);
  };

  const latest = batches[0];

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Sweep size={11} />
          <span className="text-muted">Threshold:</span>
          <span className="fw-600">500 USDT / addr</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Lightning size={11} />
          <span className="text-muted">Gas top-up:</span>
          <span className="fw-600">automatic</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">Idempotency:</span>
          <span className="fw-600">per-batch key</span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Operations · <span className="env-inline">low-touch consolidation</span>
          </div>
          <h1 className="page-title">Sweep</h1>
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

      <div className="kpi-strip">
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Sweep size={10} />
            Ready to sweep
          </div>
          <div className="kpi-mini-value">
            ${fmtCompact(filtered.reduce((s, a) => s + a.balanceUSDT + a.balanceUSDC, 0))}
          </div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">
              {filtered.length} {CHAINS[chain].short} addrs
            </span>
            <span className="badge-tight warn">
              <span className="dot" />
              pending
            </span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Check size={10} />
            Selected
          </div>
          <div className="kpi-mini-value">${fmtCompact(total)}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">{selectedAddrs.length} addrs</span>
            <span className="text-xs delta-up">batch</span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Lightning size={10} />
            Est. network fee
          </div>
          <div className="kpi-mini-value">{estFee.toFixed(chain === 'bnb' ? 4 : 6)}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">{chain === 'bnb' ? 'BNB' : 'SOL'}</span>
            <span className="text-xs text-muted">per batch</span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Activity size={10} />
            Last sweep
          </div>
          <div className="kpi-mini-value" style={{ fontSize: 16 }}>
            {latest ? <LiveTimeAgo at={latest.executedAt} /> : '—'}
          </div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted text-mono">{latest?.id}</span>
            {latest && (
              <StatusBadge status={latest.status === 'partial' ? 'failed' : 'completed'} />
            )}
          </div>
        </div>
      </div>

      <GasMonitor chain={chain} />

      <div className="alert info" style={{ margin: '14px 0' }}>
        <I.Info size={14} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">Sweep policy</div>
          <div className="alert-text">
            {chain === 'bnb'
              ? 'Sweeps gather deposits into the BSC hot wallet. Gas topped up automatically from ops wallet.'
              : 'Sweeps gather deposits into the Solana hot wallet. Priority fees adjust with network load.'}
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

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <h3 className="card-title">Recent batches</h3>
          <span className="text-xs text-muted">last 10 sweeps</span>
          <div className="spacer" />
          <span className="text-xs text-muted text-mono">{batches.length} total</span>
        </div>
        <table className="table table-tight">
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>Chain</th>
              <th className="num">Addresses</th>
              <th className="num">Total swept</th>
              <th className="num">Fee</th>
              <th>Status</th>
              <th className="num">Created</th>
              <th className="num">Executed</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="text-mono fw-500">{b.id}</td>
                <td>
                  <ChainPill chain={b.chain} />
                </td>
                <td className="num text-mono">{b.addresses}</td>
                <td className="num text-mono fw-500">${fmtUSD(b.total)}</td>
                <td className="num text-mono text-xs text-muted">
                  {b.fee.toFixed(b.chain === 'bnb' ? 4 : 6)} {b.chain === 'bnb' ? 'BNB' : 'SOL'}
                </td>
                <td>
                  {b.status === 'partial' ? (
                    <span className="badge-tight err">
                      <span className="dot" />
                      partial
                    </span>
                  ) : (
                    <StatusBadge status="completed" />
                  )}
                </td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={b.createdAt} />
                </td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={b.executedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !executing && setConfirmOpen(false)}
        title="Confirm sweep batch"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={executing}
            >
              Cancel
            </button>
            <button className="btn btn-accent" onClick={executeBatch} disabled={executing}>
              {executing ? (
                <>
                  Executing…{' '}
                  <I.Refresh size={12} style={{ animation: 'spin 1s linear infinite' }} />
                </>
              ) : (
                <>Sign &amp; broadcast ({selectedAddrs.length})</>
              )}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted" style={{ marginTop: 0 }}>
          Sweep{' '}
          <strong className="text-mono" style={{ color: 'var(--text)' }}>
            ${fmtUSD(total)}
          </strong>{' '}
          from {selectedAddrs.length} addresses on {CHAINS[chain].name}.
        </p>
        <div
          className="card"
          style={{
            background: 'var(--bg-sunken)',
            border: '1px solid var(--line)',
            marginBottom: 16,
          }}
        >
          <div style={{ padding: 16 }}>
            <dl className="dl">
              <dt>Destination</dt>
              <dd className="text-mono text-xs">
                {chain === 'bnb' ? 'BSC hot wallet 0x71C…' : 'Solana hot wallet 8Hk…'}
              </dd>
              <dt>Addresses</dt>
              <dd>{selectedAddrs.length}</dd>
              <dt>USDT</dt>
              <dd>${fmtUSD(totalUSDT)}</dd>
              <dt>USDC</dt>
              <dd>${fmtUSD(totalUSDC)}</dd>
              <dt>Network fee</dt>
              <dd>
                {estFee.toFixed(chain === 'bnb' ? 4 : 6)} {chain === 'bnb' ? 'BNB' : 'SOL'}
              </dd>
              <dt>Idempotency key</dt>
              <dd className="text-mono text-xs">sweep_{Date.now().toString(36)}</dd>
            </dl>
          </div>
        </div>
        <div className="alert warn">
          <I.AlertTri size={14} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">Irreversible</div>
            <div className="alert-text">
              On-chain transfer — once broadcast, cannot be cancelled.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
