import { Keypair } from '@solana/web3.js';
// Solana HD derivation — BIP44 path m/44'/501'/account'/0' from master seed (hex)
// DEV FIXTURE: seed hex in env. Prod → HSM/KMS (future phase).
// Uses SLIP-0010 ed25519 derivation via ed25519-hd-key.
import { derivePath, getPublicKey } from 'ed25519-hd-key';

export interface DerivedSolanaAddress {
  /** Base58 public key = Solana address */
  address: string;
  path: string;
  index: number;
}

/**
 * Derive a Solana keypair address from a hex-encoded seed.
 * Path: m/44'/501'/account'/0' (all components hardened per SLIP-0010 ed25519)
 *
 * NOTE: In production this will be replaced by an HSM call.
 * The seed MUST come from HD_MASTER_SEED_SOLANA env var (dev only).
 */
export function deriveSolanaAddress(
  seedHex: string,
  index: number,
  account = 0
): DerivedSolanaAddress {
  // BIP44 for Solana: m/44'/501'/account'/0' — all hardened (SLIP-0010 requirement for ed25519)
  const path = `m/44'/501'/${account}'/0'`;
  // Use index as sub-account to derive unique addresses
  const indexedPath = `m/44'/501'/${index}'/0'`;

  const { key } = derivePath(indexedPath, seedHex);
  const keypair = Keypair.fromSeed(Uint8Array.from(key));

  return {
    address: keypair.publicKey.toBase58(),
    path: indexedPath,
    index,
  };
}

/**
 * Derive a batch of Solana addresses.
 * Returns `count` addresses starting at `startIndex`.
 */
export function deriveSolanaAddressBatch(
  seedHex: string,
  startIndex: number,
  count: number
): DerivedSolanaAddress[] {
  return Array.from({ length: count }, (_, i) => deriveSolanaAddress(seedHex, startIndex + i));
}
