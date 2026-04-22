// BNB HD derivation — BIP44 path m/44'/60'/account'/change/index from BIP39 mnemonic
// DEV FIXTURE: mnemonic in env. Prod → HSM/KMS (future phase).
import { HDNodeWallet, Mnemonic, getBytes } from 'ethers';

export interface DerivedBnbAddress {
  address: string;
  path: string;
  index: number;
}

/**
 * Derive a BNB EOA address from a BIP39 mnemonic phrase.
 * Path: m/44'/60'/account'/change/index
 *
 * ethers v6: HDNodeWallet.fromMnemonic() derives to depth 5 (the default BIP44 path).
 * To derive an arbitrary path from the BIP39 seed root we must use
 * HDNodeWallet.fromSeed() which starts at depth 0, then call derivePath with
 * the full "m/..." absolute path.
 *
 * NOTE: In production this will be replaced by an HSM call.
 * The mnemonic MUST come from HD_MASTER_XPUB_BNB env var (dev only).
 */
export function deriveBnbAddress(
  mnemonic: string,
  index: number,
  account = 0,
  change = 0
): DerivedBnbAddress {
  const path = `m/44'/60'/${account}'/${change}/${index}`;
  // fromSeed creates a depth-0 root node — derivePath with "m/..." is valid here
  const seed = Mnemonic.fromPhrase(mnemonic).computeSeed();
  const root = HDNodeWallet.fromSeed(getBytes(seed));
  const wallet = root.derivePath(path);
  return {
    address: wallet.address,
    path,
    index,
  };
}

/**
 * Derive a batch of BNB addresses.
 * Returns `count` addresses starting at `startIndex`.
 */
export function deriveBnbAddressBatch(
  mnemonic: string,
  startIndex: number,
  count: number,
  account = 0,
  change = 0
): DerivedBnbAddress[] {
  return Array.from({ length: count }, (_, i) =>
    deriveBnbAddress(mnemonic, startIndex + i, account, change)
  );
}
