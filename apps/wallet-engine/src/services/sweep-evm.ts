// EVM sweep builder + signer + broadcaster for BNB Chain.
// Derives private key from HD_MASTER_XPUB_BNB mnemonic, builds an ERC-20
// transfer(dest, amount) tx, signs offline, returns hex for broadcast.
//
// Dev-mode (AUTH_DEV_MODE=true OR empty mnemonic):
//   Returns a synthetic tx hash without performing any on-chain operation.
import { HDNodeWallet, Interface, Mnemonic, Transaction, getBytes } from 'ethers';
import type { JsonRpcProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'sweep-evm' });

// ── ERC-20 transfer ABI (minimal) ─────────────────────────────────────────────
const ERC20_TRANSFER_IFACE = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

export interface BuildSweepEVMParams {
  /** BIP-44 derivation index for the source HD address */
  userAddressIndex: number;
  token: 'USDT' | 'USDC';
  /** BEP-20 contract address on BNB Chain */
  tokenContract: `0x${string}`;
  /** Amount in smallest unit (18 decimals for BNB USDT/USDC) */
  amount: bigint;
  destinationHotSafe: `0x${string}`;
  /** Chain nonce for the from-address */
  nonce: number;
}

export interface SignedSweepEVM {
  txHex: `0x${string}`;
  txHash: `0x${string}`;
  fromAddress: `0x${string}`;
}

function isDevMode(): boolean {
  // Synthetic tx allowed ONLY when AUTH_DEV_MODE is explicitly 'true'.
  // Missing mnemonic in production is a fatal config error — not a dev-mode fallback.
  return process.env.AUTH_DEV_MODE === 'true';
}

/**
 * Assert that production is not accidentally running without key material.
 * Throws immediately if called in non-dev mode with an empty mnemonic,
 * so the worker fails fast rather than silently emitting a fake hash.
 */
function assertKeyMaterial(): void {
  if (!isDevMode() && (!process.env.HD_MASTER_XPUB_BNB || process.env.HD_MASTER_XPUB_BNB === '')) {
    throw new Error(
      'FATAL: HD_MASTER_XPUB_BNB is not set and AUTH_DEV_MODE is not true. ' +
        'Refusing to produce synthetic EVM sweep tx in production.'
    );
  }
}

/** Synthesise a fake 32-byte hex tx hash */
function syntheticTxHash(): `0x${string}` {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

/**
 * Derive the BNB HD wallet at the given index from HD_MASTER_XPUB_BNB mnemonic.
 * Path: m/44'/60'/0'/0/{index}
 */
function deriveWallet(mnemonic: string, index: number): HDNodeWallet {
  const path = `m/44'/60'/0'/0/${index}`;
  const seed = Mnemonic.fromPhrase(mnemonic).computeSeed();
  const root = HDNodeWallet.fromSeed(getBytes(seed));
  return root.derivePath(path);
}

/**
 * Build and sign an ERC-20 transfer sweep tx offline.
 *
 * Dev-mode: returns a synthetic txHash without touching any key material.
 */
export async function buildAndSignSweepEVM(params: BuildSweepEVMParams): Promise<SignedSweepEVM> {
  const { userAddressIndex, tokenContract, amount, destinationHotSafe, nonce } = params;

  // Fail fast if production is missing key material
  assertKeyMaterial();

  if (isDevMode()) {
    const fakeHash = syntheticTxHash();
    logger.warn(
      { userAddressIndex, fakeHash },
      'DEV MODE: returning synthetic EVM sweep tx — no real signing'
    );
    return {
      txHex: `0x${'00'.repeat(100)}` as `0x${string}`,
      txHash: fakeHash,
      fromAddress: '0x0000000000000000000000000000000000000001',
    };
  }

  const mnemonic = process.env.HD_MASTER_XPUB_BNB ?? '';
  const wallet = deriveWallet(mnemonic, userAddressIndex);

  // Encode transfer(to, amount) calldata
  const data = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
    destinationHotSafe,
    amount,
  ]) as `0x${string}`;

  // Build EIP-1559 transaction (BNB Chain supports type 2)
  const tx = Transaction.from({
    type: 2,
    to: tokenContract,
    nonce,
    data,
    chainId: BigInt(process.env.BNB_CHAIN_ID ?? '56'),
    maxFeePerGas: BigInt(5_000_000_000), // 5 gwei — conservative default
    maxPriorityFeePerGas: BigInt(1_000_000_000), // 1 gwei
    gasLimit: BigInt(80_000), // ERC-20 transfer ~65k gas
    value: BigInt(0),
  });

  const signedTx = await wallet.signTransaction(tx);
  const parsed = Transaction.from(signedTx);

  logger.info(
    { txHash: parsed.hash, fromAddress: wallet.address, index: userAddressIndex },
    'EVM sweep tx signed'
  );

  return {
    txHex: signedTx as `0x${string}`,
    txHash: (parsed.hash ?? syntheticTxHash()) as `0x${string}`,
    fromAddress: wallet.address as `0x${string}`,
  };
}

/**
 * Broadcast a signed EVM transaction via the provided provider.
 * Dev-mode: returns synthetic result immediately.
 */
export async function broadcastSweepEVM(
  txHex: `0x${string}`,
  provider: JsonRpcProvider
): Promise<{ txHash: `0x${string}`; blockNumber?: number }> {
  assertKeyMaterial();
  if (isDevMode()) {
    return { txHash: syntheticTxHash() };
  }

  const response = await provider.broadcastTransaction(txHex);
  logger.info({ txHash: response.hash }, 'EVM sweep tx broadcast');

  const receipt = await response.wait(1);
  const result: { txHash: `0x${string}`; blockNumber?: number } = {
    txHash: response.hash as `0x${string}`,
  };
  if (receipt?.blockNumber !== undefined) {
    result.blockNumber = receipt.blockNumber;
  }
  return result;
}
