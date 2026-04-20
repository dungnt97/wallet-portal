import { ChainPill } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
// Failed-tx recovery page — stuck/failed transactions with retry/bump/cancel.
// Ports prototype page_ops_extras.jsx PageRecovery.
import { useState } from 'react';
import { minutesAgo } from '../_shared/helpers';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';

type RetryKind = 'bump' | 'retry' | 'cancel';

interface FailedTx {
  id: string;
  kind: 'withdrawal' | 'sweep';
  chain: 'bnb' | 'sol';
  amount: number;
  token: 'USDT' | 'USDC';
  reason: string;
  hash: string;
  failedAt: string;
  canBumpFee: boolean;
  canRetry: boolean;
  canCancel: boolean;
}

const FAILED_TXS: FailedTx[] = [
  {
    id: 'fx_1',
    kind: 'withdrawal',
    chain: 'bnb',
    amount: 8_400,
    token: 'USDT',
    reason: 'Out of gas (nonce 1842)',
    hash: `0x${'e1'.repeat(32)}`,
    failedAt: minutesAgo(22),
    canBumpFee: true,
    canRetry: true,
    canCancel: true,
  },
  {
    id: 'fx_2',
    kind: 'sweep',
    chain: 'bnb',
    amount: 1_120,
    token: 'USDT',
    reason: 'Nonce conflict',
    hash: `0x${'e2'.repeat(32)}`,
    failedAt: minutesAgo(88),
    canBumpFee: false,
    canRetry: true,
    canCancel: false,
  },
  {
    id: 'fx_3',
    kind: 'withdrawal',
    chain: 'sol',
    amount: 12_400,
    token: 'USDC',
    reason: 'Blockhash expired',
    hash: `SolHash${'x'.repeat(82)}`,
    failedAt: minutesAgo(14 * 60),
    canBumpFee: false,
    canRetry: true,
    canCancel: true,
  },
  {
    id: 'fx_4',
    kind: 'sweep',
    chain: 'bnb',
    amount: 540,
    token: 'USDC',
    reason: 'Insufficient gas on addr',
    hash: `0x${'e4'.repeat(32)}`,
    failedAt: minutesAgo(2 * 24 * 60),
    canBumpFee: false,
    canRetry: true,
    canCancel: false,
  },
];

export function RecoveryPage() {
  const [rows, setRows] = useState<FailedTx[]>(FAILED_TXS);
  const toast = useToast();

  const retry = (r: FailedTx, kind: RetryKind) => {
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    const msg =
      kind === 'bump' ? 'resubmitted at +25% gas' : kind === 'retry' ? 'retry queued' : 'cancelled';
    toast(`${r.id} ${msg}`, 'success');
  };

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.AlertTri size={11} />
          <span className="text-muted">Stuck:</span>
          <span className="fw-600">{rows.length} tx</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Clock size={11} />
          <span className="text-muted">Gas bumping:</span>
          <span className="fw-600">EIP-1559 +25%</span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Ops · <span className="env-inline">Broadcast queue</span>
          </div>
          <h1 className="page-title">Failed transactions</h1>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 40, marginTop: 14, textAlign: 'center' }}>
          <I.Check
            size={28}
            style={{ color: 'var(--ok-text)', margin: '0 auto 8px', display: 'block' }}
          />
          <div className="fw-500">All clear</div>
          <div className="text-sm text-muted">No failed transactions need attention.</div>
        </div>
      ) : (
        <div className="card pro-card" style={{ marginTop: 14 }}>
          <div className="pro-card-header">
            <h3 className="card-title">Needs attention</h3>
            <div className="spacer" />
            <span className="text-xs text-muted text-mono">{rows.length} tx</span>
          </div>
          <table className="table table-tight">
            <thead>
              <tr>
                <th>ID</th>
                <th>Kind</th>
                <th>Chain</th>
                <th className="num">Amount</th>
                <th>Reason</th>
                <th>Hash</th>
                <th>Failed</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-mono fw-500">{r.id}</td>
                  <td>
                    <span className={`badge-tight ${r.kind === 'withdrawal' ? 'warn' : 'info'}`}>
                      {r.kind}
                    </span>
                  </td>
                  <td>
                    <ChainPill chain={r.chain} />
                  </td>
                  <td className="num text-mono">
                    {fmtUSD(r.amount)} <span className="text-faint text-xs">{r.token}</span>
                  </td>
                  <td className="text-sm">{r.reason}</td>
                  <td className="text-mono text-xs">{shortHash(r.hash, 6, 4)}</td>
                  <td className="text-xs text-muted">
                    <LiveTimeAgo at={r.failedAt} />
                  </td>
                  <td className="num">
                    {r.canBumpFee && (
                      <button className="btn btn-ghost btn-sm" onClick={() => retry(r, 'bump')}>
                        <I.Zap size={11} /> Bump +25%
                      </button>
                    )}
                    {r.canRetry && (
                      <button className="btn btn-ghost btn-sm" onClick={() => retry(r, 'retry')}>
                        <I.Refresh size={11} /> Retry
                      </button>
                    )}
                    {r.canCancel && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => retry(r, 'cancel')}
                        style={{ color: 'var(--err-text)' }}
                      >
                        <I.X size={11} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
