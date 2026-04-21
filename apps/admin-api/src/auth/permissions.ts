// Role × permission matrix — mirrors prototype PERMS object from auth.jsx
// Each permission maps to the roles that are allowed to perform it.
// Roles ordered most → least privileged: admin > treasurer > operator > viewer

export type Role = 'admin' | 'treasurer' | 'operator' | 'viewer';

export type Permission =
  | 'reconciliation.read'
  | 'reconciliation.run'
  | 'dashboard.read'
  | 'deposits.read'
  | 'deposits.credit'
  | 'withdrawals.read'
  | 'withdrawals.create'
  | 'withdrawals.approve'
  | 'withdrawals.execute'
  | 'withdrawals.cancel'
  | 'multisig.read'
  | 'multisig.sign'
  | 'sweeps.read'
  | 'sweeps.trigger'
  | 'users.read'
  | 'users.manage'
  | 'staff.read'
  | 'staff.manage'
  | 'wallets.read'
  | 'audit.read'
  | 'ops.read'
  | 'ops.killswitch.toggle'
  | 'signers.read'
  | 'signers.manage'
  // Recovery (Slice 11) — read: admin+treasurer+operator; write: admin-only (1-of-1 override)
  | 'recovery.read'
  | 'recovery.write'
  // Global search across users + tx entities
  | 'search.read';

/** Roles permitted for each action — check with PERMS[perm].includes(role) */
export const PERMS: Record<Permission, Role[]> = {
  'dashboard.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'deposits.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'deposits.credit': ['admin', 'operator'],
  'withdrawals.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'withdrawals.create': ['admin', 'operator'],
  'withdrawals.approve': ['admin', 'treasurer'],
  'withdrawals.execute': ['admin', 'treasurer'],
  'withdrawals.cancel': ['admin', 'treasurer'],
  'multisig.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'multisig.sign': ['admin', 'treasurer'],
  'sweeps.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'sweeps.trigger': ['admin', 'operator'],
  'users.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'users.manage': ['admin', 'operator'],
  'staff.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'staff.manage': ['admin'],
  'wallets.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'audit.read': ['admin', 'treasurer'],
  'ops.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'ops.killswitch.toggle': ['admin', 'treasurer'],
  // Signer ceremony management — restricted to admin only (WebAuthn step-up required)
  'signers.read': ['admin', 'treasurer', 'operator', 'viewer'],
  'signers.manage': ['admin'],
  // Reconciliation (Slice 10) — read: ops+admin; run: admin-only
  'reconciliation.read': ['admin', 'treasurer', 'operator'],
  'reconciliation.run': ['admin'],
  // Recovery (Slice 11) — read: admin+treasurer+operator; write: admin-only (1-of-1 emergency override)
  'recovery.read': ['admin', 'treasurer', 'operator'],
  'recovery.write': ['admin'],
  // Search — admin sees users+tx; treasurer sees tx only (no user emails)
  'search.read': ['admin', 'treasurer', 'operator', 'viewer'],
};
