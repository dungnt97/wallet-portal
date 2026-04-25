// Users tables — staff table + end-users table.
// StaffTable uses StaffMemberRow from real /staff API; STAFF_DIRECTORY fixture removed.
import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
import { KYC_LABELS } from '@/api/users';
import { Address, Risk } from '@/components/custody';
import { ROLES } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';

interface StaffTableProps {
  rows: StaffMemberRow[];
}

export function StaffTable({ rows }: StaffTableProps) {
  const { t } = useTranslation();

  // Role description map — keys match API role values, values pulled from i18n.
  const roleDesc: Record<string, string> = {
    admin: t('users.roleDescAdmin'),
    treasurer: t('users.roleDescTreasurer'),
    operator: t('users.roleDescOperator'),
    viewer: t('users.roleDescViewer'),
  };

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>{t('users.thName')}</th>
          <th>{t('users.thEmail')}</th>
          <th>{t('users.thRole')}</th>
          <th>{t('users.thStatus')}</th>
          <th>{t('users.thPermissions')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={5}>
              <div className="table-empty">
                <div className="table-empty-title">{t('users.noStaff')}</div>
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
                  {t('users.statusActive')}
                </span>
              ) : (
                <span className="badge">
                  <span className="dot" />
                  {s.status}
                </span>
              )}
            </td>
            <td className="text-xs text-muted">{roleDesc[s.role] ?? ''}</td>
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
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="table-empty" style={{ padding: 40, textAlign: 'center' }}>
        <span className="text-muted text-sm">{t('users.loadingUsers')}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="table-empty" style={{ padding: 40, textAlign: 'center' }}>
        <span className="text-muted text-sm">{t('users.noUsersYet')}</span>
      </div>
    );
  }

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>{t('users.thEmail')}</th>
          <th>{t('users.thKyc')}</th>
          <th>{t('users.thStatus')}</th>
          {showRiskFlags && <th>{t('users.thRisk')}</th>}
          <th>{t('users.thJoined')}</th>
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
