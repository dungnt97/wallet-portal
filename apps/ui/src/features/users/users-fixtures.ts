// Users page fixtures — extended end-user + staff directory.
// Keeps shared FIX_USERS plus adds createdAt + normalised KYC tier string.
import { FIXTURE_STAFF, type RoleId } from '@/lib/constants';
import { FIX_USERS, type FixUser } from '../_shared/fixtures';
import { minutesAgo } from '../_shared/helpers';

export interface EnrichedUser extends FixUser {
  createdAt: string;
  kycTierShort: 'T1' | 'T2' | 'T3';
}

function normaliseKyc(t: string): 'T1' | 'T2' | 'T3' {
  if (t.includes('1')) return 'T1';
  if (t.includes('3')) return 'T3';
  return 'T2';
}

export const ENRICHED_USERS: EnrichedUser[] = FIX_USERS.map((u, i) => ({
  ...u,
  createdAt: minutesAgo(60 * 24 * (200 - i * 3)),
  kycTierShort: normaliseKyc(u.kycTier),
}));

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  initials: string;
  active: boolean;
  tz: string;
}

export const STAFF_DIRECTORY: StaffRow[] = [
  ...FIXTURE_STAFF.map((s, i) => ({
    ...s,
    tz: ['Tokyo', 'London', 'Berlin', 'Lisbon', 'Tokyo'][i] ?? 'UTC',
  })),
  {
    id: 'stf_ana',
    name: 'Ana Müller',
    email: 'ana@treasury.io',
    role: 'treasurer' as RoleId,
    initials: 'AM',
    active: true,
    tz: 'Zürich',
  },
  {
    id: 'stf_iris',
    name: 'Iris Bergström',
    email: 'iris@treasury.io',
    role: 'operator' as RoleId,
    initials: 'IB',
    active: true,
    tz: 'Stockholm',
  },
  {
    id: 'stf_carla',
    name: 'Carla Ferreira',
    email: 'carla@treasury.io',
    role: 'viewer' as RoleId,
    initials: 'CF',
    active: false,
    tz: 'São Paulo',
  },
];

export const ROLE_DESCRIPTIONS: Record<RoleId, string> = {
  admin: 'Full access. Manages staff, roles, and system config.',
  treasurer: 'Co-signs multisig operations. 2 of 3 required to approve withdrawals.',
  operator: 'Creates withdrawals, sweeps and manages users. Cannot approve.',
  viewer: 'Read-only access to dashboards and records.',
};
