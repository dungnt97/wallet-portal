// Users tables — staff table + end-users table.
import { Address, Risk } from '@/components/custody';
import { ROLES } from '@/lib/constants';
import { fmtUSD } from '@/lib/format';
import type { EnrichedUser, StaffRow } from '../_shared/fixtures';
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
  rows: EnrichedUser[];
  showRiskFlags: boolean;
  onSelect: (u: EnrichedUser) => void;
}

export function EndUsersTable({ rows, showRiskFlags, onSelect }: EndUsersTableProps) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>User</th>
          <th>Email</th>
          <th>KYC</th>
          <th>BNB address</th>
          <th>Solana address</th>
          <th className="num">USDT</th>
          <th className="num">USDC</th>
          {showRiskFlags && <th>Risk</th>}
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 22).map((u) => (
          <tr key={u.id} onClick={() => onSelect(u)} style={{ cursor: 'pointer' }}>
            <td>
              <div className="hstack">
                <div className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                  {u.initials}
                </div>
                <span className="fw-500 text-sm">{u.name}</span>
              </div>
            </td>
            <td className="text-sm text-muted">{u.email}</td>
            <td>
              <span className="badge muted">{u.kycTierShort}</span>
            </td>
            <td>
              <Address value={u.addresses.bnb} chain="bnb" />
            </td>
            <td>
              <Address value={u.addresses.sol} chain="sol" />
            </td>
            <td className="num text-mono">{fmtUSD(u.balances.USDT)}</td>
            <td className="num text-mono">{fmtUSD(u.balances.USDC)}</td>
            {showRiskFlags && (
              <td>
                <Risk level={u.risk} />
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
