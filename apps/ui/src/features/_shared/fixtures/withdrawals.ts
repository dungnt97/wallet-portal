// Withdrawal fixtures — one row per pending/completed/failed payout.
import { minutesAgo } from '../helpers';
import { evmAddr, evmHash, mul32, pickWith, solAddr, solSig } from './random';
import { TREASURERS } from './staff';

const rand = mul32(777777 ^ 0x0b01);

const STAGES = [
  'draft',
  'awaiting_signatures',
  'awaiting_signatures',
  'executing',
  'completed',
  'completed',
  'failed',
  'awaiting_signatures',
  'completed',
  'completed',
  'draft',
  'completed',
  'executing',
  'completed',
] as const;

export interface FixWithdrawal {
  id: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  destination: string;
  stage: (typeof STAGES)[number];
  risk: 'low' | 'med' | 'high';
  createdAt: string;
  requestedBy: string;
  multisig: {
    required: number;
    total: number;
    collected: number;
    approvers: { staffId: string; at: string; txSig: string }[];
    rejectedBy: string | null;
  };
  txHash: string | null;
  note: string | null;
  nonce?: number;
}

export const FIX_WITHDRAWALS: FixWithdrawal[] = Array.from({ length: 14 }, (_, i) => {
  const chain: 'bnb' | 'sol' = i % 3 === 0 ? 'sol' : 'bnb';
  const token: 'USDT' | 'USDC' = i % 2 === 0 ? 'USDT' : 'USDC';
  const amount = Math.round(rand() * 25000 * 100) / 100 + 200;
  const stage = STAGES[i] as (typeof STAGES)[number];
  const collected =
    stage === 'draft' ? 0 : stage === 'awaiting_signatures' ? (i % 2 === 0 ? 1 : 0) : 2;
  const approvers = TREASURERS.slice(0, collected).map((t, k) => ({
    staffId: t.id,
    at: minutesAgo(10 + i * 45 - (k + 1) * 4),
    txSig:
      chain === 'bnb'
        ? `0x${Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')}`
        : Array.from(
            { length: 10 },
            () =>
              '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rand() * 58)]
          ).join(''),
  }));
  return {
    id: `wd_${(30000 + i).toString(36)}`,
    chain,
    token,
    amount,
    destination: chain === 'bnb' ? evmAddr(rand) : solAddr(rand),
    stage,
    risk: i === 4 ? 'med' : 'low',
    createdAt: minutesAgo(15 + i * 45),
    requestedBy: pickWith(rand, ['stf_mira', 'stf_tomas', 'stf_iris']),
    multisig: { required: 2, total: 3, collected, approvers, rejectedBy: null },
    txHash:
      stage === 'completed' || stage === 'executing'
        ? chain === 'bnb'
          ? evmHash(rand)
          : solSig(rand)
        : null,
    note: i === 4 ? 'Treasury rebalance Q2' : i === 9 ? 'Vendor payment — Acme Co.' : null,
    nonce: 100 + i * 3,
  };
});
