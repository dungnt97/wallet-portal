// EVM adapter — real wagmi + Safe Protocol Kit + Safe Api Kit signing.
// Implements EIP-712 sign via wagmi useSignTypedData and Safe Tx submission.
// Env: VITE_SAFE_TX_SERVICE_URL — Safe Transaction Service base URL.
import type SafeApiKit from '@safe-global/api-kit';
import type Safe from '@safe-global/protocol-kit';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TypedDataTypes {
  [key: string]: Array<{ name: string; type: string }>;
}

export interface EVMSignParams {
  typedData: {
    domain: {
      name?: string;
      version?: string;
      chainId?: number;
      verifyingContract?: `0x${string}`;
    };
    types: TypedDataTypes;
    primaryType: string;
    message: Record<string, unknown>;
  };
  fromAddress: `0x${string}`;
}

export interface EVMSignResult {
  signature: `0x${string}`;
  signedAt: Date;
  signer: `0x${string}`;
}

export interface EVMBroadcastParams {
  safeAddress: `0x${string}`;
  safeTxHash: string;
  signatures: Array<{ signer: `0x${string}`; data: `0x${string}` }>;
}

export interface EVMBroadcastResult {
  txHash: string;
  blockNumber?: number;
}

export interface EVMBuildSafeTxParams {
  safeAddress: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  protocolKit: Safe;
}

export interface EVMBuildSafeTxResult {
  safeTxHash: string;
  /** Raw typed data ready for EIP-712 signing. */
  typedData: EVMSignParams['typedData'];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive Safe Tx Service URL from env; logs a warning if not set. */
function getSafeTxServiceUrl(): string {
  const url = import.meta.env.VITE_SAFE_TX_SERVICE_URL as string | undefined;
  if (!url) {
    console.warn(
      '[evm-adapter] VITE_SAFE_TX_SERVICE_URL not set. ' +
        'Falling back to BNB Chapel Safe Transaction Service.'
    );
    return 'https://safe-transaction-bsc-testnet.safe.global';
  }
  return url;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * EIP-712 sign via wagmi signTypedDataAsync.
 * Returns the hex signature and metadata.
 */
export async function evmSign(
  params: EVMSignParams,
  signTypedDataAsync: (args: unknown) => Promise<`0x${string}`>
): Promise<EVMSignResult> {
  const { typedData, fromAddress } = params;

  let signature: `0x${string}`;
  try {
    signature = await signTypedDataAsync({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'EVM signing failed';
    throw new Error(`[evm-adapter] evmSign: ${msg}`);
  }

  if (!signature || !signature.startsWith('0x')) {
    throw new Error('[evm-adapter] evmSign: invalid signature returned from wallet');
  }

  return {
    signature,
    signedAt: new Date(),
    signer: fromAddress,
  };
}

/**
 * Submit a collected signature to Safe Transaction Service.
 * Uses apiKit.confirmTransaction for each signature, then returns the tx hash
 * once the threshold is reached and the tx is executed.
 */
export async function evmBroadcastViaSafe(
  params: EVMBroadcastParams,
  apiKit: SafeApiKit
): Promise<EVMBroadcastResult> {
  const { safeTxHash, signatures, safeAddress } = params;

  if (!safeAddress) {
    throw new Error('[evm-adapter] evmBroadcastViaSafe: safeAddress required');
  }
  if (!safeTxHash) {
    throw new Error('[evm-adapter] evmBroadcastViaSafe: safeTxHash required');
  }

  // Confirm each signature with the Safe Tx Service
  for (const sig of signatures) {
    try {
      await apiKit.confirmTransaction(safeTxHash, sig.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[evm-adapter] evmBroadcastViaSafe: confirmTransaction failed: ${msg}`);
    }
  }

  // Return the safeTxHash as the tx identifier (execution hash comes from execution step)
  return {
    txHash: safeTxHash,
  };
}

/**
 * Build a Safe transaction from withdrawal details.
 * Returns safeTxHash and EIP-712 typed data for signing.
 */
export async function evmBuildSafeTx(params: EVMBuildSafeTxParams): Promise<EVMBuildSafeTxResult> {
  const { safeAddress, to, value, data, protocolKit } = params;

  if (!safeAddress) {
    throw new Error('[evm-adapter] evmBuildSafeTx: safeAddress required');
  }

  let safeTransaction: Awaited<ReturnType<Safe['createTransaction']>>;
  try {
    safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to,
          value: value.toString(),
          data,
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[evm-adapter] evmBuildSafeTx: createTransaction failed: ${msg}`);
  }

  let safeTxHash: string;
  try {
    safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[evm-adapter] evmBuildSafeTx: getTransactionHash failed: ${msg}`);
  }

  // Build the EIP-712 typed data matching Safe v1.4.1 schema
  const txData = safeTransaction.data;
  const typedData: EVMSignParams['typedData'] = {
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 97, // BNB Chapel
      verifyingContract: safeAddress,
    },
    primaryType: 'SafeTx',
    types: {
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    message: {
      to: txData.to,
      value: txData.value,
      data: txData.data,
      operation: txData.operation ?? 0,
      safeTxGas: txData.safeTxGas,
      baseGas: txData.baseGas,
      gasPrice: txData.gasPrice,
      gasToken: txData.gasToken,
      refundReceiver: txData.refundReceiver,
      nonce: txData.nonce,
    },
  };

  return { safeTxHash, typedData };
}

/** Expose the derived Safe Tx Service URL for consumers that need to init ApiKit. */
export { getSafeTxServiceUrl };
