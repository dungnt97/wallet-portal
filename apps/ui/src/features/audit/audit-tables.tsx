// Audit log tables — actions table (paginated) + logins table.
import { I } from '@/icons';
import { ROLES, type RoleId } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import { LiveTimeAgo } from '../_shared/realtime';
import type { AuditEntry, LoginEvent } from './audit-fixtures';

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

interface ActionsTableProps {
  rows: AuditEntry[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}

export function AuditActionsTable({
  rows,
  page,
  totalPages,
  total,
  pageSize,
  onPrev,
  onNext,
}: ActionsTableProps) {
  return (
    <>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>Action</th>
            <th>Subject</th>
            <th>Actor</th>
            <th>IP</th>
            <th className="num">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>
                <div className="hstack">
                  <span
                    style={{
                      color: l.severity === 'warn' ? 'var(--warn-text)' : 'var(--text-muted)',
                    }}
                  >
                    {actionIcon(l.action)}
                  </span>
                  <span className="text-mono text-xs fw-500">{l.action}</span>
                  {l.severity === 'warn' && (
                    <span className="badge-tight warn">
                      <span className="dot" />
                      warn
                    </span>
                  )}
                </div>
              </td>
              <td className="text-sm">{l.subject}</td>
              <td>
                {l.actor === 'system' ? (
                  <span className="badge muted">
                    <I.Lightning size={10} />
                    system
                  </span>
                ) : (
                  <div className="hstack">
                    <div className="avatar" style={{ width: 18, height: 18, fontSize: 8 }}>
                      {l.actor.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm">{l.actor}</span>
                  </div>
                )}
              </td>
              <td className="text-mono text-xs text-muted">{l.ip}</td>
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={l.timestamp} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <span>
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}{' '}
          of {total}
        </span>
        <div className="spacer" />
        <button type="button" disabled={page <= 1} onClick={onPrev}>
          <I.ChevronLeft size={12} /> Prev
        </button>
        <span>
          <span className="text-mono">{page}</span> /{' '}
          <span className="text-mono">{totalPages}</span>
        </span>
        <button type="button" disabled={page >= totalPages} onClick={onNext}>
          Next <I.ChevronRight size={12} />
        </button>
      </div>
    </>
  );
}

interface LoginsTableProps {
  rows: LoginEvent[];
}

export function AuditLoginsTable({ rows }: LoginsTableProps) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Staff</th>
          <th>Role</th>
          <th>IP</th>
          <th>User agent</th>
          <th className="num">When</th>
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
              No sign-in events recorded in this session.
            </td>
          </tr>
        )}
        {rows.map((l) => (
          <tr key={l.id}>
            <td>
              <div className="hstack">
                <div className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                  {l.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')}
                </div>
                <div>
                  <div className="fw-500 text-sm">{l.name}</div>
                  <div className="text-xs text-muted">{l.email}</div>
                </div>
              </div>
            </td>
            <td>
              <span className={`role-pill role-${l.role}`}>
                {ROLES[l.role as RoleId]?.label ?? l.role}
              </span>
            </td>
            <td className="text-mono text-xs text-muted">{l.ip}</td>
            <td className="text-xs text-muted">{l.ua}</td>
            <td className="num text-xs text-muted">{fmtDateTime(l.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
