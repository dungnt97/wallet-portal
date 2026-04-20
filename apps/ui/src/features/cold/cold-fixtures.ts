// Cold storage fixtures — cold/hot wallets and rebalance history.
// Ports prototype page_cold.jsx in-file constants.
import { minutesAgo } from '../_shared/helpers';

export interface ColdWallet {
  id: string;
  chain: 'bnb' | 'sol';
  name: string;
  address: string;
  balanceUsd: number;
  type: string;
  geographic: string;
}

export interface HotWallet {
  id: string;
  chain: 'bnb' | 'sol';
  name: string;
  balanceUsd: number;
  targetFloor: number;
  targetCeiling: number;
}

export interface RebalanceOp {
  id: string;
  chain: 'bnb' | 'sol';
  direction: 'hot→cold' | 'cold→hot';
  amount: number;
  createdAt: string;
  executedAt: string | null;
  sigs: number;
  status: 'awaiting_signatures' | 'completed';
  txHash: string | null;
  proposer: string;
}

export const COLD_WALLETS: ColdWallet[] = [
  {
    id: 'cold_bnb',
    chain: 'bnb',
    name: 'BSC Cold Vault',
    address: `0xC01D${'b'.repeat(36)}`,
    balanceUsd: 3_850_200.14,
    type: 'Gnosis Safe · 3/5 signers',
    geographic: 'HSM · Zürich vault',
  },
  {
    id: 'cold_sol',
    chain: 'sol',
    name: 'Solana Cold Vault',
    address: `C0lDSoL${'x'.repeat(37)}`,
    balanceUsd: 1_240_500.77,
    type: 'Squads · 3/5 signers',
    geographic: 'HSM · Singapore vault',
  },
];

export const HOT_WALLETS: HotWallet[] = [
  {
    id: 'hot_bnb',
    chain: 'bnb',
    name: 'BSC Hot Wallet',
    balanceUsd: 812_450.3,
    targetFloor: 400_000,
    targetCeiling: 750_000,
  },
  {
    id: 'hot_sol',
    chain: 'sol',
    name: 'Solana Hot Wallet',
    balanceUsd: 380_620.55,
    targetFloor: 200_000,
    targetCeiling: 500_000,
  },
];

export const REBALANCE_HISTORY: RebalanceOp[] = [
  {
    id: 'rb_0041',
    chain: 'bnb',
    direction: 'hot→cold',
    amount: 180_000,
    createdAt: minutesAgo(60 * 6),
    executedAt: minutesAgo(60 * 5 + 10),
    sigs: 2,
    status: 'completed',
    txHash: `0x${'ab'.repeat(32)}`,
    proposer: 'stf_mira',
  },
  {
    id: 'rb_0040',
    chain: 'sol',
    direction: 'cold→hot',
    amount: 120_000,
    createdAt: minutesAgo(60 * 28),
    executedAt: minutesAgo(60 * 27),
    sigs: 3,
    status: 'completed',
    txHash: `Sol${'x'.repeat(85)}`,
    proposer: 'stf_ben',
  },
  {
    id: 'rb_0039',
    chain: 'bnb',
    direction: 'hot→cold',
    amount: 250_000,
    createdAt: minutesAgo(60 * 72),
    executedAt: minutesAgo(60 * 71),
    sigs: 2,
    status: 'completed',
    txHash: `0x${'cd'.repeat(32)}`,
    proposer: 'stf_mira',
  },
];
