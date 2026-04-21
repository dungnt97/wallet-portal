// Audit log tables — real-data actions table (paginated + expandable) + logins table.
// LoginEvent fixture removed; AuditLoginsTable now takes LoginHistoryRow from queries.ts.
import type { LoginHistoryRow } from '@/api/queries';
import { I } from '@/icons';
import { ROLES, type RoleId } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';
import type { AuditLogEntry } from './use-audit-logs';

function actionIcon(action: string) {
  if (action.startsWith('sweep')) return <I.Sweep size={12} />;
  if (action.startsWith('deposit')) return <I.ArrowDown size={12} />;
  if (action.startsWith('withdrawal')) return <I.ArrowUp size={12} />;
  if (action.startsWith('multisig')) return <I.Shield size={12} />;
  if (action.startsWith('auth')) return <I.Shield size={12} />;
  if (action.startsWith('user')) return <I.Users size={12} />;
  if (action.startsWith('admin')) return <I.Users size={12} />;
  if (action.startsWith('config')) return <I.Settings size={12} />;
  if (action.startsWith('rpc')) return <I.Network size={12} />;
  return <I.Logs size={12} />;
}

interface HashBadgeProps {
  valid: boolean | undefined;
}

function HashBadge({ valid }: HashBadgeProps) {
  if (valid === undefined) {
    return <span className="badge-tight muted">—</span>;
  }
  return valid ? (
    <span className="badge-tight ok" title="Hash verified">
      <span className="dot" />✓
    </span>
  ) : (
    <span className="badge-tight danger" title="Hash mismatch">
      <span className="dot" />✗
    </span>
  );
}

interface ActionsTableProps {
  rows: AuditLogEntry[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** Map of row.id → hash validity from verifyChain; empty map = not yet verified */
  hashValidity?: Map<string, boolean>;
  onPrev: () => void;
  onNext: () => void;
  onRowClick: (row: AuditLogEntry) => void;
}

export function AuditActionsTable({
  rows,
  page,
  totalPages,
  total,
  pageSize,
  hashValidity = new Map(),
  onPrev,
  onNext,
  onRowClick,
}: ActionsTableProps) {
  const { t } = useTranslation();

  return (
    <>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>{t('audit.table.action')}</th>
            <th>{t('audit.table.entity')}</th>
            <th>{t('audit.table.actor')}</th>
            <th>{t('audit.table.ip')}</th>
            <th style={{ textAlign: 'center' }}>{t('audit.table.hash')}</th>
            <th className="num">{t('audit.table.when')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="text-sm text-muted"
                style={{ textAlign: 'center', padding: 40 }}
              >
                {t('common.empty')}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              style={{ cursor: 'pointer' }}
              className="hoverable"
            >
              <td>
                <div className="hstack">
                  <span style={{ color: 'var(--text-muted)' }}>{actionIcon(row.action)}</span>
                  <span className="text-mono text-xs fw-500">{row.action}</span>
                </div>
              </td>
              <td className="text-sm text-mono">
                {row.resourceType}
                {row.resourceId && (
                  <span className="text-muted"> · {row.resourceId.slice(0, 8)}…</span>
                )}
              </td>
              <td>
                {!row.staffId ? (
                  <span className="badge muted">
                    <I.Lightning size={10} />
                    system
                  </span>
                ) : (
                  <div className="hstack">
                    <div className="avatar" style={{ width: 18, height: 18, fontSize: 8 }}>
                      {row.actorName
                        ? row.actorName
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .toUpperCase()
                        : '?'}
                    </div>
                    <span className="text-sm">{row.actorEmail ?? row.staffId.slice(0, 8)}</span>
                  </div>
                )}
              </td>
              <td className="text-mono text-xs text-muted">{row.ipAddr ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>
                <HashBadge valid={hashValidity.get(row.id)} />
              </td>
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={row.createdAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <span>
          {t('audit.table.showing', {
            from: total === 0 ? 0 : (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, total),
            total,
          })}
        </span>
        <div className="spacer" />
        <button type="button" disabled={page <= 1} onClick={onPrev}>
          <I.ChevronLeft size={12} /> {t('common.back')}
        </button>
        <span>
          <span className="text-mono">{page}</span> /{' '}
          <span className="text-mono">{totalPages}</span>
        </span>
        <button type="button" disabled={page >= totalPages} onClick={onNext}>
          {t('common.next')} <I.ChevronRight size={12} />
        </button>
      </div>
    </>
  );
}

interface LoginsTableProps {
  rows: LoginHistoryRow[];
}

export function AuditLoginsTable({ rows }: LoginsTableProps) {
  const { t } = useTranslation();

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>{t('users.colUser')}</th>
          <th>{t('users.colRole')}</th>
          <th>{t('audit.table.ip')}</th>
          <th>UA</th>
          <th className="num">{t('audit.table.when')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={5}
              className="text-sm text-muted"
              style={{ textAlign: 'center', padding: 40 }}
            >
              {t('common.empty')}
            </td>
          </tr>
        )}
        {rows.map((l) => (
          <tr key={l.id}>
            <td>
              <div className="hstack">
                <div className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                  {l.staffName
                    .split(' ')
                    .map((p) => p[0])
                    .join('')}
                </div>
                <div>
                  <div className="fw-500 text-sm">{l.staffName}</div>
                  <div className="text-xs text-muted">{l.email}</div>
                </div>
              </div>
            </td>
            <td>
              <span className={`badge-tight ${l.result === 'success' ? 'ok' : 'err'}`}>
                <span className="dot" />
                {l.result}
              </span>
            </td>
            <td className="text-mono text-xs text-muted">{l.ip}</td>
            <td className="text-xs text-muted">{l.userAgent}</td>
            <td className="num text-xs text-muted">{fmtDateTime(l.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
