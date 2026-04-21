// evm-safe-tx-builder — builds a real Safe transaction from a SigningOp using
// @safe-global/protocol-kit v5, returning the EIP-712 typed data AND the correct
// safeTxHash (keccak256 digest of the SafeTx message, NOT a signature).
//
// Uses Safe.init({ provider: rpcUrl, safeAddress }) for read-only access —
// no signing key needed here; we just need the Safe nonce + tx hash.
//
// Handles ERC-20 token withdrawal ops (USDT/USDC, 6 decimals).
// Used by wallet-sign-popup EVM path (C3 fix).
import Safe from '@safe-global/protocol-kit';
import type { EVMSignParams } from './evm-adapter';
import type { SigningOp } from './signing-flow-types';

export interface EvmSafeTxBuilderParams {
  safeAddress: `0x${string}`;
  op: SigningOp;
}

export interface EvmSafeTxBuilderResult {
  safeTxHash: string;
  typedData: EVMSignParams['typedData'];
}

// ERC-20 transfer(address,uint256) manual ABI encoding.
// Avoids importing ethers at the call site — keeps bundle split clean.
function encodeErc20Transfer(to: string, amountWei: bigint): `0x${string}` {
  // transfer(address,uint256) selector = keccak256("transfer(address,uint256)")[0..4] = 0xa9059cbb
  const selector = 'a9059cbb';
  const paddedTo = to.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const paddedAmount = amountWei.toString(16).padStart(64, '0');
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

/**
 * Build real Safe tx typed data for the given withdrawal op.
 * Uses @safe-global/protocol-kit v5 Safe.init() — provider-only, no signer key.
 *
 * Throws if VITE_BNB_RPC_URL or VITE_BNB_{TOKEN}_ADDRESS env is missing.
 */
export async function buildEvmSafeTxTypedData(
  params: EvmSafeTxBuilderParams
): Promise<EvmSafeTxBuilderResult> {
  const { safeAddress, op } = params;

  const rpcUrl =
    (import.meta.env.VITE_BNB_RPC_URL as string | undefined) ??
    'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

  const tokenEnvKey = op.token === 'USDT' ? 'VITE_BNB_USDT_ADDRESS' : 'VITE_BNB_USDC_ADDRESS';
  const tokenAddress = import.meta.env[tokenEnvKey] as string | undefined;

  if (!tokenAddress) {
    throw new Error(
      `[evm-safe-tx-builder] ${tokenEnvKey} not set — cannot build ERC-20 transfer calldata`
    );
  }

  // ERC-20 amount in 6-decimal fixed point (USDT/USDC standard)
  const amountWei = BigInt(Math.round(op.amount * 1_000_000));
  const txData = encodeErc20Transfer(op.destination, amountWei);

  // protocol-kit v5: Safe.init({ provider: rpcUrl, safeAddress })
  // Read-only: no signer required — we only need nonce + tx hash computation.
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    safeAddress,
  });

  const safeTransaction = await protocolKit.createTransaction({
    transactions: [
      {
        to: tokenAddress,
        value: '0',
        data: txData,
      },
    ],
  });

  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

  // Build EIP-712 typed data from the Safe tx fields for wagmi signTypedData
  const txFields = safeTransaction.data;
  const typedData: EVMSignParams['typedData'] = {
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 97, // BNB Chapel testnet
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
      to: txFields.to as `0x${string}`,
      value: txFields.value,
      data: txFields.data as `0x${string}`,
      operation: txFields.operation ?? 0,
      safeTxGas: txFields.safeTxGas,
      baseGas: txFields.baseGas,
      gasPrice: txFields.gasPrice,
      gasToken: txFields.gasToken as `0x${string}`,
      refundReceiver: txFields.refundReceiver as `0x${string}`,
      nonce: txFields.nonce,
    },
  };

  return { safeTxHash, typedData };
}
