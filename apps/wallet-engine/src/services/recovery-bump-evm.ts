// EVM gas-bump service — rebuilds a stuck EVM tx at the same nonce with higher EIP-1559 fees.
// Uses ethers.js v6 provider.getFeeData() (equivalent to viem estimateFeesPerGas).
//
// Bump formula: bumpedFee = max(currentNetworkFee, origFee × multiplier)
// Floor rule: bumped fee must be ≥ origFee × 1.10 (EIP-1559 min replacement rule).
// Hard cap: RECOVERY_MAX_BUMP_GWEI env (default 50 gwei) — fail-closed if exceeded.
//
// Dev-mode (AUTH_DEV_MODE=true OR missing mnemonic): returns synthetic tx hash.
import { HDNodeWallet, Mnemonic, Transaction, getBytes } from 'ethers';
import type { FallbackProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'recovery-bump-evm' });

const GWEI = 1_000_000_000n;
// Minimum replacement multiplier per EIP-1559 mempool rules (10%)
const MIN_BUMP_NUMERATOR = 110n;
const MIN_BUMP_DENOMINATOR = 100n;

export interface BumpEvmParams {
  /** Original tx hash to read nonce + to/value/data from on-chain */
  originalTxHash: string;
  /** Nonce of the original tx — must match what's on-chain */
  nonce: number;
  /** Fee multiplier (e.g. 1.15 for 15% increase) */
  feeMultiplier: number;
  /** BNB Chain ID */
  chainId: bigint;
  /** HD derivation index for the signing wallet */
  hdIndex: number;
}

export interface BumpEvmResult {
  txHash: string;
  newMaxFeePerGas: bigint;
  newMaxPriorityFeePerGas: bigint;
}

function isDevMode(): boolean {
  return process.env.AUTH_DEV_MODE === 'true';
}

function assertKeyMaterial(): void {
  if (!isDevMode() && (!process.env.HD_MASTER_XPUB_BNB || process.env.HD_MASTER_XPUB_BNB === '')) {
    throw new Error(
      'FATAL: HD_MASTER_XPUB_BNB is not set and AUTH_DEV_MODE is not true. ' +
        'Refusing to produce synthetic EVM bump tx in production.'
    );
  }
}

function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

function deriveWallet(mnemonic: string, index: number): HDNodeWallet {
  const path = `m/44'/60'/0'/0/${index}`;
  const seed = Mnemonic.fromPhrase(mnemonic).computeSeed();
  const root = HDNodeWallet.fromSeed(getBytes(seed));
  return root.derivePath(path);
}

/** Apply multiplier to a bigint fee with integer arithmetic (avoids float precision loss) */
function applyMultiplier(fee: bigint, multiplierFloat: number): bigint {
  // Convert float multiplier to rational: e.g. 1.15 → 115/100
  const numerator = BigInt(Math.round(multiplierFloat * 1000));
  return (fee * numerator) / 1000n;
}

/**
 * Rebuild and broadcast an EVM tx at the same nonce with bumped EIP-1559 fees.
 * Reads original tx params from the provider, applies the fee multiplier,
 * enforces the minimum 10% bump floor, and hard-caps at RECOVERY_MAX_BUMP_GWEI.
 *
 * Fails closed (throws) if gas oracle unreachable — ops must resolve before retrying.
 */
export async function bumpEvmTx(
  params: BumpEvmParams,
  provider: FallbackProvider
): Promise<BumpEvmResult> {
  const { originalTxHash, nonce, feeMultiplier, chainId, hdIndex } = params;

  assertKeyMaterial();
  if (isDevMode()) {
    const fakeHash = syntheticTxHash();
    logger.warn({ originalTxHash, fakeHash }, 'DEV MODE: synthetic bump tx — no real signing');
    return {
      txHash: fakeHash,
      newMaxFeePerGas: 5n * GWEI,
      newMaxPriorityFeePerGas: 1n * GWEI,
    };
  }

  // 1. Fetch original tx to extract to/value/data/gasLimit
  const origTx = await provider.getTransaction(originalTxHash);
  if (!origTx) {
    throw new Error(`Original tx not found on-chain: ${originalTxHash}`);
  }

  const origMaxFee = origTx.maxFeePerGas ?? 5n * GWEI;
  const origTip = origTx.maxPriorityFeePerGas ?? 1n * GWEI;

  // 2. Fetch current network fee estimate — fail-closed (propagate error to caller as 503)
  let feeData: Awaited<ReturnType<typeof provider.getFeeData>>;
  try {
    feeData = await provider.getFeeData();
  } catch (err) {
    logger.error({ err }, 'Gas oracle unreachable — failing closed per recovery policy');
    throw new Error('GAS_ORACLE_UNAVAILABLE');
  }

  const networkMaxFee = feeData.maxFeePerGas ?? 5n * GWEI;
  const networkTip = feeData.maxPriorityFeePerGas ?? 1n * GWEI;

  // 3. Apply multiplier, enforce minimum 10% bump floor over original
  const multipliedMaxFee = applyMultiplier(origMaxFee, feeMultiplier);
  const multipliedTip = applyMultiplier(origTip, feeMultiplier);

  const minMaxFee = (origMaxFee * MIN_BUMP_NUMERATOR) / MIN_BUMP_DENOMINATOR;
  const minTip = (origTip * MIN_BUMP_NUMERATOR) / MIN_BUMP_DENOMINATOR;

  // Take highest of: multiplied, network estimate, minimum floor
  let newMaxFee = multipliedMaxFee > networkMaxFee ? multipliedMaxFee : networkMaxFee;
  newMaxFee = newMaxFee > minMaxFee ? newMaxFee : minMaxFee;

  let newTip = multipliedTip > networkTip ? multipliedTip : networkTip;
  newTip = newTip > minTip ? newTip : minTip;

  // 4. Hard cap check — fail-closed if bumped fee exceeds operator limit
  const maxBumpGwei = BigInt(Math.round(Number(process.env.RECOVERY_MAX_BUMP_GWEI ?? '50')));
  const hardCapWei = maxBumpGwei * GWEI;
  if (newMaxFee > hardCapWei) {
    throw new Error(
      `BUMP_FEE_CAP_EXCEEDED: newMaxFeePerGas=${newMaxFee / GWEI}gwei > cap=${maxBumpGwei}gwei`
    );
  }

  // 5. Build replacement tx — same nonce, to, value, data; bumped gas
  const mnemonic = process.env.HD_MASTER_XPUB_BNB ?? '';
  const wallet = deriveWallet(mnemonic, hdIndex);

  const tx = Transaction.from({
    type: 2,
    to: origTx.to ?? null,
    nonce,
    data: origTx.data as `0x${string}`,
    value: origTx.value,
    chainId,
    maxFeePerGas: newMaxFee,
    maxPriorityFeePerGas: newTip,
    gasLimit: origTx.gasLimit,
  });

  const signedTx = await wallet.signTransaction(tx);
  const parsed = Transaction.from(signedTx);

  // 6. Broadcast
  await provider.broadcastTransaction(signedTx);

  const txHash = parsed.hash ?? syntheticTxHash();
  logger.info(
    { originalTxHash, txHash, newMaxFeeGwei: newMaxFee / GWEI, nonce },
    'EVM bump tx broadcast'
  );

  return { txHash, newMaxFeePerGas: newMaxFee, newMaxPriorityFeePerGas: newTip };
}
