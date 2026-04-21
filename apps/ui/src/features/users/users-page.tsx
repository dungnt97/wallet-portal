import { useStaffList } from '@/api/queries';
import type { KycTier, UserRecord } from '@/api/users';
import { useUserList } from '@/api/users';
// Users page — staff directory + end-user list. STAFF_DIRECTORY fixture replaced with
// real useStaffList() hook wired to /staff API.
import { useAuth } from '@/auth/use-auth';
import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadCSV } from '../_shared/helpers';
import { LiveDot } from '../_shared/realtime';
import { InviteModal } from './invite-modal';
import { UserDetailSheet } from './users-detail-sheet';
import { UsersKpiStrip } from './users-kpi-strip';
import { AddUserModal } from './users-modals';
import { EndUsersTable, StaffTable } from './users-tables';

type Tab = 'staff' | 'endusers';

export function UsersPage() {
  const { t } = useTranslation();
  const { staff } = useAuth();
  const toast = useToast();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const [tab, setTab] = useState<Tab>('staff');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState<KycTier | ''>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const canManageStaff = staff?.role === 'admin';
  const canCreateUser = staff?.role === 'admin' || staff?.role === 'operator';

  // Real staff list from /staff API
  const staffQuery = useStaffList({ limit: 100 });
  const staffAll = staffQuery.data?.data ?? [];
  const staffFiltered = staffAll.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  // Server-side filtered + paginated user list
  const usersQuery = useUserList({
    q: search || undefined,
    kycTier: kycFilter || undefined,
    limit: 50,
  });

  const endUsers = usersQuery.data?.data ?? [];
  const totalUsers = usersQuery.data?.total ?? 0;

  const doExport = () => {
    if (tab === 'staff') {
      downloadCSV(
        'staff.csv',
        staffFiltered.map((s) => [s.name, s.email, s.role, s.status]),
        ['name', 'email', 'role', 'status']
      );
    } else {
      downloadCSV(
        'users.csv',
        endUsers.map((u) => [u.email, u.kycTier, u.status, u.createdAt]),
        ['email', 'kyc', 'status', 'created']
      );
    }
    toast('Exported.', 'success');
  };

  return (
    <PageFrame
      eyebrow={
        <>
          Identity ·{' '}
          <span className="env-inline">
            {tab === 'staff' ? t('users.tabStaff') : t('users.tabUsers')}
          </span>
        </>
      }
      title={t('users.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Shield size={11} />
            <span className="text-muted">RBAC:</span>
            <span className="fw-600">4 roles</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Users size={11} />
            <span className="text-muted">Staff MFA:</span>
            <span className="fw-600">enforced</span>
            <LiveDot />
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">HD wallet:</span>
            <span className="fw-600">m/44'/60·501'</span>
          </div>
          <div className="spacer" />
          <span className="policy-strip-item text-mono text-xs text-muted">
            <I.Logs size={11} /> audit: every action logged
          </span>
        </div>
      }
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> {t('common.export')}
          </button>
          {tab === 'staff' ? (
            <button
              type="button"
              className="btn btn-accent"
              disabled={!canManageStaff}
              title={!canManageStaff ? 'Admins only' : ''}
              onClick={() => setInviteOpen(true)}
            >
              <I.Plus size={13} /> Invite staff
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              disabled={!canCreateUser}
              title={!canCreateUser ? 'No permission' : ''}
              onClick={() => setAddUserOpen(true)}
            >
              <I.Plus size={13} /> Add user
            </button>
          )}
        </>
      }
      kpis={
        <UsersKpiStrip
          users={endUsers}
          totalUsers={totalUsers}
          staff={staffQuery.data ? staffAll : null}
        />
      }
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'staff', label: 'Staff', count: staffAll.length },
              { value: 'endusers', label: 'End users', count: totalUsers },
            ]}
          />
          <div className="spacer" />
          <div className="inline-search">
            <I.Search size={13} />
            <input
              placeholder={tab === 'staff' ? 'Search staff…' : 'Search users…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {tab === 'staff' ? (
            <Filter label="Role" />
          ) : (
            <select
              className="input"
              style={{ fontSize: 12, padding: '4px 8px' }}
              value={kycFilter}
              onChange={(e) => setKycFilter(e.target.value as KycTier | '')}
            >
              <option value="">All KYC tiers</option>
              <option value="none">None</option>
              <option value="basic">T1 Basic</option>
              <option value="enhanced">T3 Enhanced</option>
            </select>
          )}
          <span className="text-xs text-muted text-mono">
            {tab === 'staff' ? (staffQuery.isLoading ? '…' : staffFiltered.length) : totalUsers}
          </span>
        </div>

        {tab === 'staff' ? (
          <StaffTable rows={staffFiltered} />
        ) : (
          <EndUsersTable
            rows={endUsers}
            loading={usersQuery.isLoading}
            showRiskFlags={showRiskFlags}
            onSelect={(u) => setSelectedId(u.id)}
          />
        )}
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} />
      <UserDetailSheet
        userId={selectedId}
        showRiskFlags={showRiskFlags}
        onClose={() => setSelectedId(null)}
      />
    </PageFrame>
  );
}
