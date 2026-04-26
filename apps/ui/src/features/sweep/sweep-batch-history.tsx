// Sweep batch history table — uses SweepBatchRow from real /sweeps/batches API.
// Local Batch type removed; INITIAL_SWEEP_BATCHES fixture no longer used here.
import type { SweepBatchRow } from '@/api/queries';
import { ChainPill, StatusBadge } from '@/components/custody';
import { fmtUSD } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';

/** Re-export so sweep-page can type the state without importing from queries */
export type Batch = SweepBatchRow;

interface Props {
  batches: SweepBatchRow[];
}

export function SweepBatchHistory({ batches }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <h3 className="card-title">{t('sweep.recentBatches')}</h3>
        <span className="text-xs text-muted">{t('sweep.recentBatchesSub')}</span>
        <div className="spacer" />
        <span className="text-xs text-muted text-mono">
          {t('sweep.batchesCount', { n: batches.length })}
        </span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>{t('sweep.cBatchId')}</th>
            <th>{t('common.chain')}</th>
            <th className="num">{t('sweep.cAddresses')}</th>
            <th className="num">{t('sweep.cTotalSwept')}</th>
            <th className="num">{t('sweep.cFee')}</th>
            <th>{t('common.status')}</th>
            <th className="num">{t('sweep.cCreated')}</th>
            <th className="num">{t('sweep.cExecuted')}</th>
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
                    {t('sweep.partial')}
                  </span>
                ) : (
                  <StatusBadge status="completed" />
                )}
              </td>
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={b.createdAt} />
              </td>
              <td className="num text-xs text-muted">
                {b.executedAt ? (
                  <LiveTimeAgo at={b.executedAt} />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
