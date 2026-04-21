// ERC-20 Transfer log parser for BNB/BSC chain
// Parses Transfer(address,address,uint256) events from USDT/USDC contracts.
import { id as ethersId } from 'ethers';
import type { Log } from 'ethers';

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = ethersId('Transfer(address,address,uint256)');

export type TokenSymbol = 'USDT' | 'USDC';

export interface ParsedErc20Transfer {
  from: string; // lowercase hex
  to: string; // lowercase hex
  amount: bigint; // raw token units (no decimal adjustment)
  txHash: string;
  blockNumber: number;
  logIndex: number;
  token: TokenSymbol;
  contractAddress: string; // lowercase
}

/**
 * Parse a single ERC-20 Transfer log.
 * Returns null if the log does not match USDT/USDC Transfer signature.
 */
export function parseErc20TransferLog(
  log: Log,
  usdtAddress: string,
  usdcAddress: string
): ParsedErc20Transfer | null {
  // Must be Transfer topic
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return null;
  // Transfer has 3 topics: topic0=sig, topic1=from, topic2=to
  if (log.topics.length < 3) return null;

  const contractAddr = log.address.toLowerCase();
  let token: TokenSymbol;

  if (contractAddr === usdtAddress.toLowerCase()) {
    token = 'USDT';
  } else if (contractAddr === usdcAddress.toLowerCase()) {
    token = 'USDC';
  } else {
    return null;
  }

  // topics are 32-byte padded; last 20 bytes = address
  const from = `0x${(log.topics[1] ?? '').slice(-40)}`;
  const to = `0x${(log.topics[2] ?? '').slice(-40)}`;

  let amount: bigint;
  try {
    amount = BigInt(log.data === '0x' || log.data === '' ? '0' : log.data);
  } catch {
    return null;
  }

  return {
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    amount,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.index ?? 0,
    token,
    contractAddress: contractAddr,
  };
}
