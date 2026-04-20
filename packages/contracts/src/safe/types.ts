// MVP STUB — EIP-712 typed data for Safe multisig transactions (BNB chain)
// Full implementation wired in P09 withdrawal flow.

/** Minimal Safe transaction payload passed to EIP-712 signing and on-chain execution. */
export type SafeTransactionData = {
  to: string;
  value: bigint;
  data: string;
  operation: 0 | 1; // 0 = Call, 1 = DelegateCall
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: string;
  refundReceiver: string;
  nonce: bigint;
};
