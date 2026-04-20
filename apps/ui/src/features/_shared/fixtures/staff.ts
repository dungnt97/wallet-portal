// Staff / Treasurer fixtures — Treasurer signing set + admin directory.
import { FIXTURE_STAFF, type RoleId } from '@/lib/constants';
import { evmAddr, mul32, solAddr } from './random';

// Dedicated seed so rewriting `users.ts` doesn't shift treasurer addresses.
const rand = mul32(777777);

export const TREASURERS = [
  {
    id: 'stf_ben',
    name: 'Ben Foster',
    initials: 'BF',
    email: 'ben@treasury.io',
    tz: 'Europe/London',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(rand),
    solAddr: solAddr(rand),
  },
  {
    id: 'stf_hana',
    name: 'Hana Petersen',
    initials: 'HP',
    email: 'hana@treasury.io',
    tz: 'Europe/Berlin',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(rand),
    solAddr: solAddr(rand),
  },
  {
    id: 'stf_ana',
    name: 'Ana Silva',
    initials: 'AS',
    email: 'ana@treasury.io',
    tz: 'America/Sao_Paulo',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(rand),
    solAddr: solAddr(rand),
  },
];

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
