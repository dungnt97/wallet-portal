import type { UserRecord } from '@/api/users';
import { KYC_LABELS } from '@/api/users';
// Users tables — staff table + end-users table (real API shape, Slice 8).
import { Address, Risk } from '@/components/custody';
import { ROLES } from '@/lib/constants';
import type { StaffRow } from '../_shared/fixtures';
import { ROLE_DESCRIPTIONS } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface StaffTableProps {
  rows: StaffRow[];
}

export function StaffTable({ rows }: StaffTableProps) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Timezone</th>
          <th>Status</th>
          <th>Permissions</th>
        </tr>
      </thead>
      <tbody>
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
              <span className={`role-pill role-${s.role}`}>{ROLES[s.role].label}</span>
            </td>
            <td className="text-sm text-muted">{s.tz}</td>
            <td>
              {s.active ? (
                <span className="badge ok">
                  <span className="dot" />
                  Active
                </span>
              ) : (
                <span className="badge">
                  <span className="dot" />
                  Disabled
                </span>
              )}
            </td>
            <td className="text-xs text-muted">{ROLE_DESCRIPTIONS[s.role]}</td>
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
                {/* riskScore is 0-100; map to low/med/high for display */}
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
