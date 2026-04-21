// snapshot-list — paginated table of reconciliation snapshots with severity badge
import type { ReconciliationSnapshot } from '@/api/reconciliation';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';

interface Props {
  snapshots: ReconciliationSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMinorUsd(minor: string | null): string {
  if (!minor) return '—';
  // USDT/USDC on BNB = 18 dec; on SOL = 6 dec. We display as approximate USD.
  // Minor values stored as aggregate across chains; treat as 6-dec for display.
  const val = Number(minor) / 1e6;
  return `$${fmtUSD(val)}`;
}

function StatusBadge({ status }: { status: ReconciliationSnapshot['status'] }) {
  const map: Record<typeof status, { cls: string; label: string }> = {
    running: { cls: 'badge-tight warn', label: 'Running' },
    completed: { cls: 'badge-tight ok', label: 'Completed' },
    failed: { cls: 'badge-tight err', label: 'Failed' },
    cancelled: { cls: 'badge-tight', label: 'Cancelled' },
  };
  const cfg = map[status] ?? { cls: 'badge-tight', label: status };
  return (
    <span className={cfg.cls}>
      <span className="dot" />
      {cfg.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SnapshotList({ snapshots, selectedId, onSelect }: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="card pro-card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="text-muted text-sm">No snapshots yet. Run a reconciliation to begin.</p>
      </div>
    );
  }

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <h3 className="card-title">Snapshots</h3>
        <div className="spacer" />
        <span className="text-xs text-muted">{snapshots.length} entries</span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>Started</th>
            <th>Scope</th>
            <th>Triggered by</th>
            <th className="num">Drift total</th>
            <th>Status</th>
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
              <td className="text-xs text-muted">{s.triggeredBy ? 'manual' : 'cron'}</td>
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
