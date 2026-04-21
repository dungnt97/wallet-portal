// Mock chain adapters — stand in for real wagmi/viem / @solana/web3.js calls.
// @deprecated — used only when VITE_AUTH_DEV_MODE=true (CI / offline demo).
// Real adapters: evm-adapter.ts and solana-adapter.ts.
import type { BroadcastResult, SignedSignature, SigningOp } from './signing-flow-types';

/**
 * Mock EIP-712 / Ed25519 sign — resolves after a short delay.
 * @deprecated Use evmSign / solanaSign when VITE_AUTH_DEV_MODE !== 'true'.
 */
export function mockSign(op: SigningOp): Promise<SignedSignature> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sig =
        op.chain === 'bnb'
          ? `0x${Array.from(
              { length: 130 },
              () => '0123456789abcdef'[Math.floor(Math.random() * 16)]
            ).join('')}`
          : Array.from(
              { length: 88 },
              () =>
                '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[
                  Math.floor(Math.random() * 58)
                ]
            ).join('');
      resolve({
        signer: op.chain === 'bnb' ? '0xSignerAddress' : 'SolSignerAddr',
        signature: sig,
        at: new Date().toISOString(),
      });
    }, 900);
  });
}

/**
 * Mock on-chain broadcast — resolves after simulated "confirmation".
 * @deprecated Use evmBroadcastViaSafe / solanaProposeSquads when VITE_AUTH_DEV_MODE !== 'true'.
 */
export function mockBroadcast(op: SigningOp): Promise<BroadcastResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const hash =
        op.chain === 'bnb'
          ? `0x${Array.from(
              { length: 64 },
              () => '0123456789abcdef'[Math.floor(Math.random() * 16)]
            ).join('')}`
          : Array.from(
              { length: 88 },
              () =>
                '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[
                  Math.floor(Math.random() * 58)
                ]
            ).join('');
      resolve({
        hash,
        blockNumber: Math.floor(Math.random() * 1_000_000) + 40_000_000,
        confirmedAt: new Date().toISOString(),
      });
    }, 1500);
  });
}
