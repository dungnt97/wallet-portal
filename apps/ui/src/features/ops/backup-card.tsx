// backup-card — trigger pg_dump and show history (last 20 runs).
// POST /ops/backup/pg-dump → enqueues job; GET /ops/backups → history table.
// Admin-only section on ops page.
import { api } from '@/api/client';
import { useToast } from '@/components/overlays';
import { fmtDateTime } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupRow {
  id: string;
  triggeredBy: string | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  s3Key: string | null;
  sizeBytes: string | null;
  durationMs: number | null;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TriggerResult {
  backupId: string;
  message: string;
  dryRun: boolean;
}

// ── API hooks ─────────────────────────────────────────────────────────────────

function useBackups() {
  return useQuery<{ data: BackupRow[] }>({
    queryKey: ['ops-backups'],
    queryFn: () => api.get('/ops/backups'),
    refetchInterval: 8_000, // poll while jobs may be running
  });
}

function useTriggerBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TriggerResult>('/ops/backup/pg-dump', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops-backups'] });
    },
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BackupRow['status'], string> = {
  pending: 'var(--text-muted)',
  running: 'var(--warn-text)',
  done: 'var(--success-text)',
  failed: 'var(--err-text)',
};

function StatusPill({ status }: { status: BackupRow['status'] }) {
  const { t } = useTranslation();
  const labels: Record<BackupRow['status'], string> = {
    pending: t('ops.backup.statusPending'),
    running: t('ops.backup.statusRunning'),
    done: t('ops.backup.statusDone'),
    failed: t('ops.backup.statusFailed'),
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: STATUS_COLORS[status],
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {labels[status]}
    </span>
  );
}

function fmtBytes(raw: string | null): string {
  if (!raw || raw === '0') return '—';
  const n = Number(raw);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BackupCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, isLoading } = useBackups();
  const trigger = useTriggerBackup();

  const rows = data?.data ?? [];
  const isDryRun = !rows.some((r) => r.s3Key && !r.s3Key.startsWith('[dry-run]'));

  const handleTrigger = () => {
    trigger.mutate(undefined, {
      onSuccess: (result) => {
        toast(t('ops.backup.triggered') + (result.dryRun ? ' (dry-run)' : ''), 'success');
      },
      onError: (err) => {
        toast((err as Error).message ?? t('common.error'), 'error');
      },
    });
  };

  return (
    <div className="card pro-card" style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('ops.backup.cardTitle')}</div>
          {isDryRun && (
            <div className="text-xs" style={{ color: 'var(--warn-text)', marginTop: 3 }}>
              {t('ops.backup.dryRunNote')}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-accent"
          onClick={handleTrigger}
          disabled={trigger.isPending}
          style={{ flexShrink: 0 }}
        >
          {trigger.isPending ? t('ops.backup.triggering') : t('ops.backup.triggerBtn')}
        </button>
      </div>

      {/* History table */}
      <div className="text-xs fw-600 text-muted" style={{ marginBottom: 8 }}>
        {t('ops.backup.historyTitle')}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted">{t('ops.backup.noHistory')}</div>
      ) : (
        <table className="table table-tight" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>{t('ops.backup.colTriggered')}</th>
              <th>{t('ops.backup.colStatus')}</th>
              <th>{t('ops.backup.colSize')}</th>
              <th>{t('ops.backup.colDuration')}</th>
              <th>{t('ops.backup.colKey')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-mono text-xs">{fmtDateTime(row.createdAt)}</td>
                <td>
                  <StatusPill status={row.status} />
                  {row.errorMsg && (
                    <div className="text-xs" style={{ color: 'var(--err-text)', marginTop: 2 }}>
                      {row.errorMsg.slice(0, 60)}
                    </div>
                  )}
                </td>
                <td className="text-mono">{fmtBytes(row.sizeBytes)}</td>
                <td className="text-mono">
                  {row.durationMs !== null ? `${row.durationMs}ms` : '—'}
                </td>
                <td
                  className="text-mono text-xs"
                  style={{
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.s3Key ?? undefined}
                >
                  {row.s3Key ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
