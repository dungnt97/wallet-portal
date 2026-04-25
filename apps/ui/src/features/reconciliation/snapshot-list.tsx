// snapshot-list — paginated table of reconciliation snapshots with severity badge
import type { ReconciliationSnapshot } from '@/api/reconciliation';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useTranslation } from 'react-i18next';

interface Props {
  snapshots: ReconciliationSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMinorUsd(minor: string | null): string {
  if (!minor) return '—';
  const val = Number(minor) / 1e6;
  return `$${fmtUSD(val)}`;
}

function StatusBadge({ status }: { status: ReconciliationSnapshot['status'] }) {
  const { t } = useTranslation();
  const map: Record<typeof status, { cls: string; key: string }> = {
    running: { cls: 'badge-tight warn', key: 'recon.statusRunning' },
    completed: { cls: 'badge-tight ok', key: 'recon.statusCompleted' },
    failed: { cls: 'badge-tight err', key: 'recon.statusFailed' },
    cancelled: { cls: 'badge-tight', key: 'recon.statusCancelled' },
  };
  const cfg = map[status] ?? { cls: 'badge-tight', key: '' };
  return (
    <span className={cfg.cls}>
      <span className="dot" />
      {cfg.key ? t(cfg.key) : status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SnapshotList({ snapshots, selectedId, onSelect }: Props) {
  const { t } = useTranslation();

  if (snapshots.length === 0) {
    return (
      <div className="card pro-card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted text-sm">{t('recon.noSnapshots')}</p>
      </div>
    );
  }

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <h3 className="card-title">{t('recon.snapshots')}</h3>
        <div className="spacer" />
        <span className="text-xs text-muted">
          {t('recon.entries', { n: snapshots.length })}
        </span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>{t('recon.colStarted')}</th>
            <th>{t('recon.colScope')}</th>
            <th>{t('recon.colTriggeredBy')}</th>
            <th className="num">{t('recon.colDriftTotal')}</th>
            <th>{t('common.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr
              key={s.id}
              className={selectedId === s.id ? 'row-selected' : ''}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(s.id)}
            >
              <td className="text-mono text-xs">{new Date(s.createdAt).toLocaleString()}</td>
              <td>
                <span className="badge-tight">{s.scope}</span>
                {s.chain && (
                  <span className="badge-tight" style={{ marginLeft: 4 }}>
                    {s.chain}
                  </span>
                )}
              </td>
              <td className="text-xs text-muted">
                {s.triggeredBy ? t('recon.triggerManual') : t('recon.triggerCron')}
              </td>
              <td className="num text-mono">{formatMinorUsd(s.driftTotalMinor)}</td>
              <td>
                <StatusBadge status={s.status} />
              </td>
              <td>
                <I.ChevronRight size={12} className="text-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
