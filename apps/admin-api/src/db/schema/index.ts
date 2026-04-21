// Barrel export — re-exports all tables + enums for use by admin-api and
// downstream consumers via the package export "@wp/admin-api/db-schema"
//
// Note: drizzle-kit resolves these imports directly from .ts files at schema
// generation time. The .js extensions satisfy the Node ESM runtime; drizzle-kit
// resolves the underlying .ts source via its own bundler.
export * from './enums';
export * from './staff';
export * from './users';
export * from './wallets';
export * from './deposits';
export * from './withdrawals';
export * from './multisig';
export * from './sweeps';
export * from './transactions';
export * from './audit';
export * from './ledger';
export * from './staff-webauthn-credentials';
export * from './watcher-checkpoints';
export * from './kill-switch';
export * from './notifications';
