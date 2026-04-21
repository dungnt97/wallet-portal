// Shared Postgres enums — imported by all schema files
// Mirrors @wp/shared-types primitives but as Drizzle pgEnum declarations
import { pgEnum } from 'drizzle-orm/pg-core';

/** Supported blockchain networks */
export const chainEnum = pgEnum('chain', ['bnb', 'sol']);

/** Supported stablecoin tokens */
export const tokenEnum = pgEnum('token', ['USDT', 'USDC']);

/** Staff access roles — ordered from most to least privileged */
export const roleEnum = pgEnum('role', ['admin', 'treasurer', 'operator', 'viewer']);

/** Wallet custody tier: hot = operationally accessible, cold = restricted */
export const tierEnum = pgEnum('tier', ['hot', 'cold']);

/** Wallet purpose within the custody system */
export const walletPurposeEnum = pgEnum('wallet_purpose', [
  'deposit_hd',
  'operational',
  'cold_reserve',
]);

/** Hardware wallet or browser extension type for signing keys */
export const walletTypeEnum = pgEnum('wallet_type', [
  'metamask',
  'phantom',
  'ledger',
  'trezor',
  'hardware_via_metamask',
  'other',
]);

/** Staff account lifecycle status — 'invited' added migration 0018 */
export const staffStatusEnum = pgEnum('staff_status', [
  'active',
  'suspended',
  'offboarded',
  'invited',
]);

/** User account lifecycle status */
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'closed']);

/** KYC verification tier for users */
export const kycTierEnum = pgEnum('kyc_tier', ['none', 'basic', 'enhanced']);

/** Deposit state machine */
export const depositStatusEnum = pgEnum('deposit_status', [
  'pending',
  'credited',
  'swept',
  'failed',
  'reorg_pending',
]);

/** Withdrawal state machine — 'broadcast', 'cancelling' added in migration 0016 (Slice 11) */
export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'pending',
  'approved',
  'time_locked',
  'executing',
  'broadcast',
  'cancelling',
  'completed',
  'cancelled',
  'failed',
]);

/** Sweep state machine */
export const sweepStatusEnum = pgEnum('sweep_status', [
  'pending',
  'submitted',
  'confirmed',
  'failed',
]);

/** Multisig operation state machine */
export const multisigStatusEnum = pgEnum('multisig_status', [
  'pending',
  'collecting',
  'ready',
  'submitted',
  'confirmed',
  'expired',
  'failed',
]);

/** On-chain transaction confirmation state */
export const txStatusEnum = pgEnum('tx_status', ['pending', 'confirmed', 'failed', 'dropped']);
