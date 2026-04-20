// Users page — staff directory + end-user list. Ports prototype page_users.jsx.
import { useAuth } from '@/auth/use-auth';
import { Filter, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useState } from 'react';
import { downloadCSV } from '../_shared/helpers';
import { LiveDot } from '../_shared/realtime';
import { UserDetailSheet } from './users-detail-sheet';
import { ENRICHED_USERS, type EnrichedUser, STAFF_DIRECTORY } from './users-fixtures';
import { UsersKpiStrip } from './users-kpi-strip';
import { AddUserModal, InviteStaffModal } from './users-modals';
import { EndUsersTable, StaffTable } from './users-tables';

type Tab = 'staff' | 'endusers';

export function UsersPage() {
  const { staff } = useAuth();
  const toast = useToast();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const [tab, setTab] = useState<Tab>('staff');
  const [selected, setSelected] = useState<EnrichedUser | null>(null);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const canManageStaff = staff?.role === 'admin';
  const canCreateUser = staff?.role === 'admin' || staff?.role === 'operator';

  const staffFiltered = STAFF_DIRECTORY.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );
  const endUsers = ENRICHED_USERS.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const doExport = () => {
    if (tab === 'staff') {
      downloadCSV(
        'staff.csv',
        staffFiltered.map((s) => [s.name, s.email, s.role, s.tz, s.active ? 'yes' : 'no']),
        ['name', 'email', 'role', 'tz', 'active']
      );
    } else {
      downloadCSV(
        'users.csv',
        endUsers.map((u) => [
          u.name,
          u.email,
          u.kycTierShort,
          u.addresses.bnb,
          u.addresses.sol,
          u.balances.USDT,
          u.balances.USDC,
          u.createdAt,
        ]),
        ['name', 'email', 'kyc', 'bnb_addr', 'sol_addr', 'USDT', 'USDC', 'created']
      );
    }
    toast('Exported.', 'success');
  };

  return (
    <div className="page page-dense">
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

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Identity ·{' '}
            <span className="env-inline">{tab === 'staff' ? 'Staff & roles' : 'End users'}</span>
          </div>
          <h1 className="page-title">Users</h1>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> Export
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
        </div>
      </div>

      <UsersKpiStrip users={ENRICHED_USERS} staff={STAFF_DIRECTORY} />

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'staff', label: 'Staff', count: STAFF_DIRECTORY.length },
              { value: 'endusers', label: 'End users', count: ENRICHED_USERS.length },
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
          {tab === 'staff' ? <Filter label="Role" /> : <Filter label="KYC tier" />}
          <span className="text-xs text-muted text-mono">
            {tab === 'staff' ? staffFiltered.length : endUsers.length}
          </span>
        </div>

        {tab === 'staff' ? (
          <StaffTable rows={staffFiltered} />
        ) : (
          <EndUsersTable rows={endUsers} showRiskFlags={showRiskFlags} onSelect={setSelected} />
        )}
      </div>

      <InviteStaffModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} />
      <UserDetailSheet
        user={selected}
        showRiskFlags={showRiskFlags}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
