import bs58 from 'bs58';
import type { Queue } from 'bullmq';
import { vi } from 'vitest';
import type { Db } from '../db/client.js';
import { TOKEN_PROGRAM_ID } from '../watcher/solana-tx-parser.js';

export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DST_ATA = 'DstTokenAccount111111111111111111111111111111';
export const SRC_ATA = 'SrcTokenAccount111111111111111111111111111111';
export const AUTHORITY = 'Authority111111111111111111111111111111111111';
/** Wallet address that owns DST_ATA — what the registry should contain */
export const WALLET_ADDR = 'WalletOwner1111111111111111111111111111111111';
export const USER_ID = 'user-sol-1';
export const SIG = 'solSig1111111111111111111111111111111111111111111111111111111111';

/** Encode SPL Transfer (disc=3) instruction data */
function encodeTransfer(amount: bigint): string {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(amount, 1);
  return bs58.encode(buf);
}

/**
 * Build a minimal block fixture with one SPL Transfer to DST_ATA.
 * postTokenBalances.owner is set to WALLET_ADDR (the actual wallet, not the ATA)
 * so the watcher correctly resolves ATA→wallet via transfer.owner.
 */
export function makeBlock(slot: number, destAta = DST_ATA, ownerAddr = WALLET_ADDR) {
  const accountKeys = [
    { pubkey: { toBase58: () => TOKEN_PROGRAM_ID } },
    { pubkey: { toBase58: () => SRC_ATA } },
    { pubkey: { toBase58: () => destAta } },
    { pubkey: { toBase58: () => AUTHORITY } },
    { pubkey: { toBase58: () => USDT_MINT } },
  ];

  const instruction = {
    programIdIndex: 0,
    accounts: [1, 2, 3],
    data: encodeTransfer(500_000n),
  };

  const tx = {
    transaction: {
      signatures: [SIG],
      message: {
        accountKeys,
        instructions: [instruction],
        recentBlockhash: 'blockhash',
      },
    },
    meta: {
      err: null,
      innerInstructions: [],
      postTokenBalances: [
        {
          accountIndex: 2,
          mint: USDT_MINT,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
          owner: ownerAddr,
          programId: TOKEN_PROGRAM_ID,
        },
      ],
      preTokenBalances: [],
      logMessages: [],
    },
  };

  return {
    blockhash: `hash${slot}`,
    previousBlockhash: `hash${slot - 1}`,
    parentSlot: slot - 1,
    transactions: [tx],
    blockTime: 1700000000,
    blockHeight: slot,
    rewards: [],
  };
}

export function makeDb(): Db {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([{ id: 'dep-sol-1' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(1) }),
    }),
  } as unknown as Db;
}

export function makeQueue(): Queue {
  return { add: vi.fn().mockResolvedValue({ id: 'job-sol-1' }) } as unknown as Queue;
}
