import { ChainPill, TokenPill } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtCompact, fmtUSD } from '@/lib/format';
// Reconciliation page — internal ledger vs on-chain truth. Prove-of-reserves view.
// Ports prototype page_ops_extras.jsx PageRecon.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker } from '../_shared/realtime';

interface ReconRow {
  id: string;
  account: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  internal: number;
  onchain: number;
  status: 'match' | 'drift';
  note?: string;
}

const RECON_ROWS: ReconRow[] = [
  {
    id: 'rc_1',
    account: 'BSC Hot Wallet',
    chain: 'bnb',
    token: 'USDT',
    internal: 482_341.55,
    onchain: 482_341.55,
    status: 'match',
  },
  {
    id: 'rc_2',
    account: 'BSC Hot Wallet',
    chain: 'bnb',
    token: 'USDC',
    internal: 318_902.41,
    onchain: 318_902.41,
    status: 'match',
  },
  {
    id: 'rc_3',
    account: 'Solana Hot',
    chain: 'sol',
    token: 'USDT',
    internal: 224_119.07,
    onchain: 224_119.07,
    status: 'match',
  },
  {
    id: 'rc_4',
    account: 'Deposit addr 0x4a…',
    chain: 'bnb',
    token: 'USDT',
    internal: 1_820,
    onchain: 1_820,
    status: 'match',
  },
  {
    id: 'rc_5',
    account: 'Deposit addr 0x7e…',
    chain: 'bnb',
    token: 'USDT',
    internal: 320,
    onchain: 350,
    status: 'drift',
    note: 'On-chain > internal — possible missed deposit',
  },
  {
    id: 'rc_6',
    account: 'Deposit addr Gs9…',
    chain: 'sol',
    token: 'USDC',
    internal: 1_100,
    onchain: 0,
    status: 'drift',
    note: 'Internal > on-chain — user credited but chain empty (swept?)',
  },
  {
    id: 'rc_7',
    account: 'BSC Cold Vault',
    chain: 'bnb',
    token: 'USDT',
    internal: 3_850_200.14,
    onchain: 3_850_200.14,
    status: 'match',
  },
];

export function ReconPage() {
  const { t } = useTranslation();
  const [rows] = useState<ReconRow[]>(RECON_ROWS);
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const totalInternal = rows.reduce((s, r) => s + r.internal, 0);
  const totalOnchain = rows.reduce((s, r) => s + r.onchain, 0);
  const drifts = rows.filter((r) => r.status !== 'match');
  const driftAmt = Math.abs(totalInternal - totalOnchain);
  const coverage = ((rows.filter((r) => r.status === 'match').length / rows.length) * 100).toFixed(
    1
  );

  const runScan = () => {
    setRunning(true);
    setTimeout(() => {
      setRunning(false);
      toast('Scan complete — 2 drifts detected', 'success');
    }, 1600);
  };

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">Scan:</span>
          <span className="fw-600">every 15m · cron</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Check size={11} />
          <span className="text-muted">Last pass:</span>
          <span className="fw-600">2m ago</span>
        </div>
        <div className="spacer" />
        <BlockTicker chain="bnb" />
        <BlockTicker chain="sol" />
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Compliance · <span className="env-inline">{t('recon.subtitle')}</span>
          </div>
          <h1 className="page-title">{t('recon.title')}</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={runScan} disabled={running}>
            <I.Refresh size={12} /> {running ? 'Scanning…' : 'Run scan now'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => toast('Report generated.', 'success')}
          >
            <I.External size={12} /> Export report
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Database size={10} />
            Internal ledger
          </div>
          <div className="kpi-mini-value">${fmtCompact(totalInternal)}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted">postgres · custody_db</span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Network size={10} />
            On-chain truth
          </div>
          <div className="kpi-mini-value">${fmtCompact(totalOnchain)}</div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted">indexed via Web3 node</span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.AlertTri size={10} />
            Drift
          </div>
          <div
            className="kpi-mini-value"
            style={{ color: driftAmt === 0 ? 'var(--ok-text)' : 'var(--err-text)' }}
          >
            ${fmtUSD(driftAmt)}
          </div>
          <div className="kpi-mini-foot">
            <span className="text-xs text-muted">{drifts.length} accounts flagged</span>
          </div>
        </div>
        <div className="kpi-mini">
          <div className="kpi-mini-label">
            <I.Shield size={10} />
            Coverage
          </div>
          <div className="kpi-mini-value">{coverage}%</div>
          <div className="kpi-mini-foot">
            <span className="badge-tight ok">
              <span className="dot" />
              Healthy
            </span>
          </div>
        </div>
      </div>

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <h3 className="card-title">Per-account reconciliation</h3>
          <div className="spacer" />
          <span className="text-xs text-muted text-mono">{rows.length} accounts</span>
        </div>
        <table className="table table-tight">
          <thead>
            <tr>
              <th>Account</th>
              <th>Chain</th>
              <th>Asset</th>
              <th className="num">Internal ledger</th>
              <th className="num">On-chain</th>
              <th className="num">Drift</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const drift = r.internal - r.onchain;
              return (
                <tr key={r.id}>
                  <td className="text-sm fw-500">{r.account}</td>
                  <td>
                    <ChainPill chain={r.chain} />
                  </td>
                  <td>
                    <TokenPill token={r.token} />
                  </td>
                  <td className="num text-mono">${fmtUSD(r.internal)}</td>
                  <td className="num text-mono">${fmtUSD(r.onchain)}</td>
                  <td
                    className="num text-mono"
                    style={{
                      color:
                        drift === 0
                          ? 'var(--text-faint)'
                          : drift > 0
                            ? 'var(--err-text)'
                            : 'var(--warn-text)',
                    }}
                  >
                    {drift === 0 ? '—' : (drift > 0 ? '+' : '') + fmtUSD(drift)}
                  </td>
                  <td>
                    {r.status === 'match' ? (
                      <span className="badge-tight ok">
                        <span className="dot" />
                        Match
                      </span>
                    ) : (
                      <span className="badge-tight err">
                        <span className="dot" />
                        Drift
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-muted">{r.note ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
