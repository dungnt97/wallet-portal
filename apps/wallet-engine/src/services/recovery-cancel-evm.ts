// EVM cancel-replace service — sends a 0-value self-transfer at the same nonce
// as the stuck tx, with a higher fee, to pre-empt it in the mempool.
//
// Cancel formula: cancelFee = max(currentNetworkFee × feeMultiplier, origFee × 1.10 floor)
// Hard cap: RECOVERY_MAX_BUMP_GWEI (shared with bump — same cap applies).
//
// Dev-mode (AUTH_DEV_MODE=true OR missing mnemonic): returns synthetic hash.
import { HDNodeWallet, Mnemonic, Transaction, getBytes } from 'ethers';
import type { FallbackProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'recovery-cancel-evm' });

const GWEI = 1_000_000_000n;
// Minimum replacement multiplier per EIP-1559 mempool rules (10% over original)
const MIN_BUMP_NUMERATOR = 110n;
const MIN_BUMP_DENOMINATOR = 100n;

export interface CancelEvmParams {
  /** Original stuck tx hash — used to fetch current fees and the nonce context */
  originalTxHash: string;
  /** Nonce of the original tx — cancel tx uses the same nonce */
  nonce: number;
  /** Fee multiplier applied on top of current network estimate (e.g. 1.2) */
  feeMultiplier: number;
  /** BNB Chain ID */
  chainId: bigint;
  /** HD derivation index for the hot-safe signer key */
  hdIndex: number;
  /** Hot-safe address — cancel tx is a 0-value self-send to this address */
  hotSafeAddress: `0x${string}`;
}

export interface CancelEvmResult {
  txHash: string;
  newMaxFeePerGas: bigint;
}

function isDevMode(): boolean {
  return (
    process.env.AUTH_DEV_MODE === 'true' ||
    !process.env.HD_MASTER_XPUB_BNB ||
    process.env.HD_MASTER_XPUB_BNB === ''
  );
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

function applyMultiplier(fee: bigint, multiplierFloat: number): bigint {
  const numerator = BigInt(Math.round(multiplierFloat * 1000));
  return (fee * numerator) / 1000n;
}

/**
 * Build and broadcast a 0-value EVM self-send at the same nonce as the stuck tx.
 * When this cancel tx confirms, the original stuck tx is pre-empted and dropped.
 *
 * Reads original tx gas params from the provider to compute the minimum replacement fee.
 * Fails closed if gas oracle is unreachable.
 */
export async function cancelEvmTx(
  params: CancelEvmParams,
  provider: FallbackProvider
): Promise<CancelEvmResult> {
  const { originalTxHash, nonce, feeMultiplier, chainId, hdIndex, hotSafeAddress } = params;

  if (isDevMode()) {
    const fakeHash = syntheticTxHash();
    logger.warn({ originalTxHash, fakeHash }, 'DEV MODE: synthetic cancel tx — no real signing');
    return { txHash: fakeHash, newMaxFeePerGas: 5n * GWEI };
  }

  // 1. Fetch original tx to compute minimum replacement fee
  const origTx = await provider.getTransaction(originalTxHash);
  const origMaxFee = origTx?.maxFeePerGas ?? 5n * GWEI;
  const origTip = origTx?.maxPriorityFeePerGas ?? 1n * GWEI;

  // 2. Get current network fee estimate — fail-closed
  let feeData: Awaited<ReturnType<typeof provider.getFeeData>>;
  try {
    feeData = await provider.getFeeData();
  } catch (err) {
    logger.error({ err }, 'Gas oracle unreachable — failing closed');
    throw new Error('GAS_ORACLE_UNAVAILABLE');
  }

  const networkMaxFee = feeData.maxFeePerGas ?? 5n * GWEI;
  const networkTip = feeData.maxPriorityFeePerGas ?? 1n * GWEI;

  // 3. Compute cancel fee: max(network × multiplier, orig × 1.10 floor)
  const appliedMaxFee = applyMultiplier(networkMaxFee, feeMultiplier);
  const appliedTip = applyMultiplier(networkTip, feeMultiplier);
  const minMaxFee = (origMaxFee * MIN_BUMP_NUMERATOR) / MIN_BUMP_DENOMINATOR;
  const minTip = (origTip * MIN_BUMP_NUMERATOR) / MIN_BUMP_DENOMINATOR;

  const newMaxFee = appliedMaxFee > minMaxFee ? appliedMaxFee : minMaxFee;
  const newTip = appliedTip > minTip ? appliedTip : minTip;

  // 4. Hard cap check (same cap as bump)
  const maxGwei = BigInt(Math.round(Number(process.env.RECOVERY_MAX_BUMP_GWEI ?? '50')));
  if (newMaxFee > maxGwei * GWEI) {
    throw new Error(
      `CANCEL_FEE_CAP_EXCEEDED: newMaxFeePerGas=${newMaxFee / GWEI}gwei > cap=${maxGwei}gwei`
    );
  }

  // 5. Build 0-value self-send at same nonce
  const mnemonic = process.env.HD_MASTER_XPUB_BNB ?? '';
  const wallet = deriveWallet(mnemonic, hdIndex);

  const tx = Transaction.from({
    type: 2,
    to: hotSafeAddress,
    nonce,
    data: '0x',
    value: 0n,
    chainId,
    maxFeePerGas: newMaxFee,
    maxPriorityFeePerGas: newTip,
    // 21_000 = base cost for plain ETH/BNB transfer (no contract call)
    gasLimit: 21_000n,
  });

  const signedTx = await wallet.signTransaction(tx);
  const parsed = Transaction.from(signedTx);
  await provider.broadcastTransaction(signedTx);

  const txHash = parsed.hash ?? syntheticTxHash();
  logger.info(
    { originalTxHash, txHash, newMaxFeeGwei: newMaxFee / GWEI, nonce },
    'EVM cancel tx broadcast'
  );

  return { txHash, newMaxFeePerGas: newMaxFee };
}
