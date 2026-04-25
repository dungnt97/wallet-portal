import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import bs58 from 'bs58';
import { TOKEN_PROGRAM_ID } from '../watcher/solana-tx-parser.js';

export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SRC_ATA = 'SrcTokenAccount111111111111111111111111111111';
export const DST_ATA = 'DstTokenAccount111111111111111111111111111111';
export const AUTHORITY = 'Authority111111111111111111111111111111111111';
export const SIG = 'testSig1111111111111111111111111111111111111111111111111111111111';

/** Build base58-encoded SPL Transfer instruction data (disc=3, amount u64 LE) */
export function encodeTransferData(amount: bigint): string {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(amount, 1);
  return bs58.encode(buf);
}

/** Build base58-encoded SPL TransferChecked instruction data (disc=12, amount u64 LE, decimals) */
export function encodeTransferCheckedData(amount: bigint, decimals = 6): string {
  const buf = Buffer.alloc(10);
  buf.writeUInt8(12, 0);
  buf.writeBigUInt64LE(amount, 1);
  buf.writeUInt8(decimals, 9);
  return bs58.encode(buf);
}

/** Build a minimal ParsedTransactionWithMeta fixture */
export function makeTx(
  overrides: {
    programId?: string;
    disc?: 'transfer' | 'transferChecked';
    amount?: bigint;
    accountKeys?: string[];
    innerOnly?: boolean;
    mint?: string;
  } = {}
): ParsedTransactionWithMeta {
  const {
    programId = TOKEN_PROGRAM_ID,
    disc = 'transfer',
    amount = 1_000_000n,
    mint = USDT_MINT,
  } = overrides;

  const accountKeys = overrides.accountKeys ?? [programId, SRC_ATA, DST_ATA, AUTHORITY, mint];
  const data = disc === 'transfer' ? encodeTransferData(amount) : encodeTransferCheckedData(amount);
  const programIdIndex = 0;
  // Transfer: accounts = [src=1, dst=2, authority=3]
  // TransferChecked: accounts = [src=1, mint=4, dst=2, authority=3]
  const accounts = disc === 'transfer' ? [1, 2, 3] : [1, 4, 2, 3];
  const instruction = { programIdIndex, accounts, data };

  const postTokenBalances = [
    {
      accountIndex: 2,
      mint,
      uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1.0' },
      owner: AUTHORITY,
      programId: programId,
    },
  ];

  const tx: unknown = {
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys: accountKeys.map((pk) => ({
          pubkey: { toBase58: () => pk },
          isSigner: false,
          isWritable: false,
        })),
        instructions: overrides.innerOnly ? [] : [instruction],
        recentBlockhash: 'blockhash',
      },
    },
    meta: {
      err: null,
      fee: 5000,
      innerInstructions: overrides.innerOnly ? [{ index: 0, instructions: [instruction] }] : [],
      postTokenBalances,
      preTokenBalances: [],
      logMessages: [],
    },
    blockTime: 1700000000,
    slot: 999,
  };

  return tx as ParsedTransactionWithMeta;
}
