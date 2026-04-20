import { ChainPill, PageFrame } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
// Failed-tx recovery page — stuck/failed transactions with retry/bump/cancel.
// Ports prototype page_ops_extras.jsx PageRecovery.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FAILED_TXS, type FailedTx } from '../_shared/fixtures';
import { BlockTicker, LiveTimeAgo } from '../_shared/realtime';

type RetryKind = 'bump' | 'retry' | 'cancel';

export function RecoveryPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FailedTx[]>(FAILED_TXS);
  const toast = useToast();

  const retry = (r: FailedTx, kind: RetryKind) => {
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    const msg =
      kind === 'bump' ? 'resubmitted at +25% gas' : kind === 'retry' ? 'retry queued' : 'cancelled';
    toast(`${r.id} ${msg}`, 'success');
  };

  return (
    <PageFrame
      eyebrow={
        <>
          Ops · <span className="env-inline">{t('recovery.subtitle')}</span>
        </>
      }
      title={t('recovery.title')}
      policyStrip={
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
      }
    >
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
    </PageFrame>
  );
}
