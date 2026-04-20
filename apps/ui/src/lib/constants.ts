// App-level constants — chain/token registry + RBAC

export const CHAINS = {
  bnb: { id: 'bnb', name: 'BNB Chain', short: 'BNB', confirmations: 15 },
  sol: { id: 'sol', name: 'Solana', short: 'SOL', confirmations: 32 },
} as const;

export const TOKENS = {
  USDT: { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  USDC: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
} as const;

export const ROLES = {
  admin:     { id: 'admin',     label: 'Admin',     accent: 'oklch(55% 0.18 268)' },
  treasurer: { id: 'treasurer', label: 'Treasurer', accent: 'oklch(55% 0.15 165)' },
  operator:  { id: 'operator',  label: 'Operator',  accent: 'oklch(60% 0.14 230)' },
  viewer:    { id: 'viewer',    label: 'Viewer',    accent: 'oklch(60% 0.02 260)' },
} as const;

export type RoleId = keyof typeof ROLES;

// Fixture staff — used only for local/demo login until P06 OIDC wires in
export const FIXTURE_STAFF = [
  { id: 'stf_mira',  name: 'Mira Sato',      email: 'mira@treasury.io',  role: 'admin'     as RoleId, initials: 'MS', active: true },
  { id: 'stf_ben',   name: 'Ben Foster',     email: 'ben@treasury.io',   role: 'treasurer' as RoleId, initials: 'BF', active: true },
  { id: 'stf_hana',  name: 'Hana Petersen',  email: 'hana@treasury.io',  role: 'treasurer' as RoleId, initials: 'HP', active: true },
  { id: 'stf_tomas', name: 'Tomás Ribeiro',  email: 'tomas@treasury.io', role: 'operator'  as RoleId, initials: 'TR', active: true },
  { id: 'stf_kenji', name: 'Kenji Mori',     email: 'kenji@treasury.io', role: 'viewer'    as RoleId, initials: 'KM', active: true },
];

export const MULTISIG_POLICY = { required: 2, total: 3 };

// Viewport breakpoints (px) — xs < 720, sm < 1100, md < 1400, wide >= 1400
export const BREAKPOINTS = { xs: 720, sm: 1100, md: 1400 } as const;
export type ViewportBucket = 'xs' | 'sm' | 'md' | 'wide';
