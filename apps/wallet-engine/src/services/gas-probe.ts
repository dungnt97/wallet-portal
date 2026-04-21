import type { Connection } from '@solana/web3.js';
// Gas probe — single-snapshot price from BNB and Solana RPC.
// BNB:    getFeeData().gasPrice           → gwei (number)
// Solana: getRecentPrioritizationFees()  → SOL/sig (number)
import type { FallbackProvider } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'gas-probe' });

const WEI_PER_GWEI = 1_000_000_000n;

/**
 * Probe current BNB gas price via getFeeData().gasPrice (AbstractProvider API).
 * Returns gwei as a floating-point number (2 dp).
 * Throws if the RPC call fails — caller must handle.
 */
export async function probeBnbGas(provider: FallbackProvider): Promise<number> {
  const feeData = await provider.getFeeData();
  // gasPrice is in wei; fall back to maxFeePerGas for EIP-1559 networks
  const weiPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (weiPrice === null) throw new Error('BNB getFeeData returned no gas price');
  const gwei = Number((weiPrice * 100n) / WEI_PER_GWEI) / 100;
  logger.debug({ gwei }, 'BNB gas probe');
  return gwei;
}

/**
 * Probe current Solana priority fee via getRecentPrioritizationFees().
 * Returns the median microLamports/sig across the most-recent slot samples.
 * Falls back to 0 if no data (unloaded network / localnet).
 */
export async function probeSolanaGas(connection: Connection): Promise<number> {
  // Returns up to 150 recent slots; take median to smooth spikes
  const fees = await connection.getRecentPrioritizationFees();
  if (fees.length === 0) return 0;

  const sorted = [...fees].sort((a, b) => a.prioritizationFee - b.prioritizationFee);
  const mid = Math.floor(sorted.length / 2);
  // Odd length → middle element; even → average of two middle.
  // Array is non-empty (guarded above) so index access is always valid.
  const midFee = sorted[mid]?.prioritizationFee ?? 0;
  const midPrevFee = sorted[mid - 1]?.prioritizationFee ?? 0;
  const median = sorted.length % 2 === 1 ? midFee : (midPrevFee + midFee) / 2;

  // Convert microLamports → SOL/sig for display parity with the original fixture
  const solPerSig = median / 1_000_000_000_000;
  logger.debug({ median, solPerSig }, 'Solana gas probe');
  return solPerSig;
}
