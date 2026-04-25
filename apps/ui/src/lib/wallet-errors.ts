// wallet-errors.ts — pure error classification helpers for wallet connection flows.
// Exported classifier is used by ConnectWalletModal to distinguish user-cancelled
// connections from genuine errors, avoiding confusing error screens on rejection.

/** EIP-1193 user rejection code */
const EIP1193_REJECTION_CODE = 4001;

/**
 * classifyConnectError — pure function, no side-effects, fully testable.
 *
 * Returns:
 *  'cancelled' — user explicitly rejected/closed the wallet prompt
 *  'error'     — genuine connection error (RPC failure, wrong network, etc.)
 */
export function classifyConnectError(err: unknown): 'cancelled' | 'error' {
  if (err == null) return 'error';

  // Viem UserRejectedRequestError carries code 4001 on the instance.
  // We avoid importing the class to keep this module dependency-free.
  if (
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === EIP1193_REJECTION_CODE
  ) {
    return 'cancelled';
  }

  if (err instanceof Error) {
    // Solana wallet-adapter: WalletWindowClosedError or similar rejection names
    if (
      err.name === 'WalletWindowClosedError' ||
      err.name === 'WalletConnectionError' ||
      err.name === 'UserRejectedRequestError'
    ) {
      return 'cancelled';
    }

    // Regex catch-all for descriptive rejection messages from various wallets
    if (/rejected|denied|user denied|closed/i.test(err.message)) {
      return 'cancelled';
    }
  }

  return 'error';
}
