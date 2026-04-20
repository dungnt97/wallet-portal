// Flow fixtures — withdrawals, multisig ops, transactions, sweep addresses, gas wallets.
// Split from fixtures.ts to stay under 200 LOC.
import { FIX_DEPOSITS, FIX_USERS, type FixUser } from './fixtures';
import { minutesAgo } from './helpers';

function mul32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mul32(777777);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;
const evmAddr = () =>
  `0x${Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')}`;
const solAddr = () =>
  Array.from(
    { length: 44 },
    () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rand() * 58)]
  ).join('');
const evmHash = () =>
  `0x${Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('')}`;
const solSig = () =>
  Array.from(
    { length: 88 },
    () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rand() * 58)]
  ).join('');

// Treasurer staff for approval tracking
export const TREASURERS = [
  {
    id: 'stf_ben',
    name: 'Ben Foster',
    initials: 'BF',
    email: 'ben@treasury.io',
    tz: 'Europe/London',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(),
    solAddr: solAddr(),
  },
  {
    id: 'stf_hana',
    name: 'Hana Petersen',
    initials: 'HP',
    email: 'hana@treasury.io',
    tz: 'Europe/Berlin',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(),
    solAddr: solAddr(),
  },
  {
    id: 'stf_ana',
    name: 'Ana Silva',
    initials: 'AS',
    email: 'ana@treasury.io',
    tz: 'America/Sao_Paulo',
    role: 'treasurer' as const,
    active: true,
    evmAddr: evmAddr(),
    solAddr: solAddr(),
  },
];

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
    destination: chain === 'bnb' ? evmAddr() : solAddr(),
    stage,
    risk: i === 4 ? 'med' : 'low',
    createdAt: minutesAgo(15 + i * 45),
    requestedBy: pick(['stf_mira', 'stf_tomas', 'stf_iris']),
    multisig: { required: 2, total: 3, collected, approvers, rejectedBy: null },
    txHash:
      stage === 'completed' || stage === 'executing'
        ? chain === 'bnb'
          ? evmHash()
          : solSig()
        : null,
    note: i === 4 ? 'Treasury rebalance Q2' : i === 9 ? 'Vendor payment — Acme Co.' : null,
    nonce: 100 + i * 3,
  };
});

// Multisig ops = withdrawals in signing / ready stage
export const FIX_MULTISIG_OPS = FIX_WITHDRAWALS.filter(
  (w) => w.stage !== 'draft' && w.stage !== 'completed'
).map((w, i) => ({
  id: `op_${(40000 + i).toString(36)}`,
  withdrawalId: w.id,
  chain: w.chain,
  token: w.token,
  amount: w.amount,
  destination: w.destination,
  safeAddress: w.chain === 'bnb' ? evmAddr() : solAddr(),
  safeName: w.chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault',
  nonce: 100 + i * 3,
  required: w.multisig.required,
  total: w.multisig.total,
  collected: w.multisig.collected,
  approvers: w.multisig.approvers,
  status: w.stage === 'failed' ? 'failed' : w.stage === 'executing' ? 'ready' : 'collecting',
  createdAt: w.createdAt,
  rejectedBy: null as string | null,
}));

// Deposit addresses for sweep
export interface FixSweepAddr {
  id: string;
  userId: string;
  userName: string;
  chain: 'bnb' | 'sol';
  address: string;
  balanceUSDT: number;
  balanceUSDC: number;
  gasBalance: number;
  lastDepositAt: string;
}

export const FIX_DEPOSIT_ADDRESSES: FixSweepAddr[] = FIX_USERS.slice(0, 18)
  .flatMap((u: FixUser, idx) => {
    const out: FixSweepAddr[] = [];
    out.push({
      id: `addr_b_${u.id}`,
      userId: u.id,
      userName: u.name,
      chain: 'bnb',
      address: u.addresses.bnb,
      balanceUSDT: Math.round(rand() * 5000 * 100) / 100,
      balanceUSDC: Math.round(rand() * 3000 * 100) / 100,
      gasBalance: Math.round(rand() * 0.05 * 1000) / 1000,
      lastDepositAt: minutesAgo(20 + idx * 30),
    });
    if (idx % 2 === 0) {
      out.push({
        id: `addr_s_${u.id}`,
        userId: u.id,
        userName: u.name,
        chain: 'sol',
        address: u.addresses.sol,
        balanceUSDT: Math.round(rand() * 4000 * 100) / 100,
        balanceUSDC: Math.round(rand() * 2000 * 100) / 100,
        gasBalance: Math.round(rand() * 0.5 * 1000) / 1000,
        lastDepositAt: minutesAgo(40 + idx * 30),
      });
    }
    return out;
  })
  .filter((a) => a.balanceUSDT + a.balanceUSDC > 100);

// Transaction feed (combined)
export const FIX_TRANSACTIONS = [
  ...FIX_DEPOSITS.filter((d) => d.txHash)
    .slice(0, 10)
    .map((d, i) => ({
      id: `tx_d_${i}`,
      type: 'deposit' as const,
      chain: d.chain,
      token: d.token,
      amount: d.amount,
      txHash: d.txHash,
      status: d.status === 'pending' ? 'pending' : 'confirmed',
      timestamp: d.detectedAt,
    })),
  ...FIX_WITHDRAWALS.filter((w) => w.txHash).map((w, i) => ({
    id: `tx_w_${i}`,
    type: 'withdrawal' as const,
    chain: w.chain,
    token: w.token,
    amount: w.amount,
    txHash: w.txHash as string,
    status: w.stage === 'failed' ? 'failed' : w.stage === 'executing' ? 'pending' : 'confirmed',
    timestamp: w.createdAt,
  })),
].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
