// Broadcast dispatcher — routes to real EVM/Solana adapter or mock fallback.
// Reads VITE_AUTH_DEV_MODE to choose path. Called from signing-flow.ts.
import { mockBroadcast } from './mock-adapters';
import type { BroadcastResult, SigningOp } from './signing-flow-types';

/** True when running in dev-mode (CI / offline demo) — uses mock adapters. */
export const IS_DEV_MODE = import.meta.env.VITE_AUTH_DEV_MODE === 'true';

/**
 * Dispatch broadcast for the given op.
 * - DEV_MODE=true → mockBroadcast
 * - bnb           → evmBroadcastViaSafe (requires wagmi context — called from hook)
 * - sol           → solanaProposeSquads (requires wallet context — called from hook)
 *
 * This function handles the dev-mode path only; real paths are invoked from
 * the wallet-sign-popup component which has access to wagmi/solana hooks.
 * The hook calls broadcastReal() after receiving the signed signature.
 */
export async function broadcastDevMode(op: SigningOp): Promise<BroadcastResult> {
  return mockBroadcast(op);
}

/**
 * Produce a stub BroadcastResult from a real tx hash returned by the adapter.
 * Used to normalise real results into the existing BroadcastResult shape.
 */
export function makeBroadcastResult(txHash: string): BroadcastResult {
  return {
    hash: txHash,
    blockNumber: 0,
    confirmedAt: new Date().toISOString(),
  };
}
