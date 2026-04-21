// Users tables — staff table + end-users table.
// StaffTable uses StaffMemberRow from real /staff API; STAFF_DIRECTORY fixture removed.
import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
import { KYC_LABELS } from '@/api/users';
import { Address, Risk } from '@/components/custody';
import { ROLES } from '@/lib/constants';
import { ROLE_DESCRIPTIONS } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

// Cast to generic record so we can look up by any role string without TS errors
const ROLE_DESC = ROLE_DESCRIPTIONS as Record<string, string>;

interface StaffTableProps {
  rows: StaffMemberRow[];
}

export function StaffTable({ rows }: StaffTableProps) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Permissions</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={5}>
              <div className="table-empty">
                <div className="table-empty-title">No staff members</div>
              </div>
            </td>
          </tr>
        )}
        {rows.map((s) => (
          <tr key={s.id}>
            <td>
              <div className="hstack">
                <div className="avatar">{s.initials}</div>
                <span className="fw-500 text-sm">{s.name}</span>
              </div>
            </td>
            <td className="text-sm text-muted">{s.email}</td>
            <td>
              <span className={`role-pill role-${s.role}`}>{ROLES[s.role]?.label ?? s.role}</span>
            </td>
            <td>
              {s.status === 'active' ? (
                <span className="badge ok">
                  <span className="dot" />
                  Active
                </span>
              ) : (
                <span className="badge">
                  <span className="dot" />
                  {s.status}
                </span>
              )}
            </td>
            <td className="text-xs text-muted">{ROLE_DESC[s.role] ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface EndUsersTableProps {
  rows: UserRecord[];
  loading: boolean;
  showRiskFlags: boolean;
  onSelect: (u: UserRecord) => void;
}

export function EndUsersTable({ rows, loading, showRiskFlags, onSelect }: EndUsersTableProps) {
  if (loading) {
    return (
      <div className="table-empty" style={{ padding: 40, textAlign: 'center' }}>
        <span className="text-muted text-sm">Loading users…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="table-empty" style={{ padding: 40, textAlign: 'center' }}>
        <span className="text-muted text-sm">No users yet. Click Add user.</span>
      </div>
    );
  }

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Email</th>
          <th>KYC</th>
          <th>Status</th>
          {showRiskFlags && <th>Risk</th>}
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} onClick={() => onSelect(u)} style={{ cursor: 'pointer' }}>
            <td className="text-sm">{u.email}</td>
            <td>
              <span className="badge muted">{KYC_LABELS[u.kycTier]}</span>
            </td>
            <td>
              <span className={`badge ${u.status === 'active' ? 'ok' : ''}`}>
                <span className="dot" />
                {u.status}
              </span>
            </td>
            {showRiskFlags && (
              <td>
                <Risk level={u.riskScore >= 70 ? 'high' : u.riskScore >= 40 ? 'med' : 'low'} />
              </td>
            )}
            <td className="text-xs text-muted">
              <LiveTimeAgo at={u.createdAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
