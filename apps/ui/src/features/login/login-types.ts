// Prototype-derived demo account list + role label + multisig policy.
// Mirrors `portal/src/auth.jsx` STAFF + ROLES + MULTISIG_POLICY exactly.
// Keep `email` in sync with admin-api staff seed (mira/ben/hana/ana/tomas/iris/kenji @treasury.io).

export type Role = 'admin' | 'treasurer' | 'operator' | 'viewer';
export type StepMode = 'sso' | 'credentials' | '2fa';
export type TwoFaMode = 'webauthn' | 'totp';
export type WaState = 'idle' | 'prompting' | 'ok' | 'error';

export interface DemoStaff {
  name: string;
  email: string;
  role: Role;
  initials: string;
}

export const DEMO_STAFF: DemoStaff[] = [
  { name: 'Mira Sato', email: 'mira@treasury.io', role: 'admin', initials: 'MS' },
  { name: 'Ben Foster', email: 'ben@treasury.io', role: 'treasurer', initials: 'BF' },
  { name: 'Hana Petersen', email: 'hana@treasury.io', role: 'treasurer', initials: 'HP' },
  { name: 'Ana Müller', email: 'ana@treasury.io', role: 'treasurer', initials: 'AM' },
  { name: 'Tomás Ribeiro', email: 'tomas@treasury.io', role: 'operator', initials: 'TR' },
  { name: 'Iris Bergström', email: 'iris@treasury.io', role: 'operator', initials: 'IB' },
  { name: 'Kenji Mori', email: 'kenji@treasury.io', role: 'viewer', initials: 'KM' },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const POLICY_REQUIRED = 2;
export const POLICY_TOTAL = 3;
