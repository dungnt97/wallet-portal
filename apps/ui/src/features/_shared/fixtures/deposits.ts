// Deposit fixtures — incoming tx records + per-user deposit addresses + hot
// wallet balance totals.
import { minutesAgo } from '../helpers';
import { evmHash, mul32, solSig } from './random';
import { FIX_USERS, type FixUser } from './users';

// Seed 424242 so these outputs stay stable if `users.ts` seed changes.
const rand = mul32(424242 ^ 0x5ee5);

export interface FixDeposit {
  id: string;
  userId: string;
  userName: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  status: 'pending' | 'credited' | 'swept' | 'confirmed' | 'failed';
  address: string;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
  detectedAt: string;
  creditedAt: string | null;
  sweptAt: string | null;
  risk: 'low' | 'med' | 'high';
  blockNumber: number;
}

const STATUSES: FixDeposit['status'][] = [
  'confirmed',
  'credited',
  'credited',
  'credited',
  'pending',
  'credited',
  'credited',
  'swept',
  'credited',
  'pending',
];

export const FIX_DEPOSITS: FixDeposit[] = Array.from({ length: 42 }, (_, i) => {
  const user = FIX_USERS[i % FIX_USERS.length] as FixUser;
  const chain: 'bnb' | 'sol' = i % 3 === 0 ? 'sol' : 'bnb';
  const token: 'USDT' | 'USDC' = i % 2 === 0 ? 'USDT' : 'USDC';
  const amount = Math.round(rand() * 8000 * 100) / 100 + 50;
  const status = STATUSES[i % STATUSES.length] as FixDeposit['status'];
  const req = chain === 'bnb' ? 15 : 32;
  const conf = status === 'pending' ? Math.floor(rand() * (req - 2)) : req;
  return {
    id: `dep_${(20000 + i).toString(36)}`,
    userId: user.id,
    userName: user.name,
    chain,
    token,
    amount,
    status,
    address: user.addresses[chain],
    txHash: chain === 'bnb' ? evmHash(rand) : solSig(rand),
    confirmations: conf,
    requiredConfirmations: req,
    detectedAt: minutesAgo(2 + i * 17),
    creditedAt: status !== 'pending' ? minutesAgo(1 + i * 16) : null,
    sweptAt: status === 'swept' ? minutesAgo(i * 15) : null,
    risk: i === 6 ? 'high' : i === 13 ? 'med' : 'low',
    blockNumber: 38_000_000 + Math.floor(rand() * 100000),
  };
});

export const TOTAL_BALANCES = {
  bnb: { USDT: 482_341.55, USDC: 318_902.41 },
  sol: { USDT: 224_119.07, USDC: 156_438.92 },
};

// Deposit-address sweep queue. One row per user address with non-trivial balance.
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

// Dedicated seed so withdrawals/multisig edits don't perturb these balances.
const addrRand = mul32(0x1501);

export const FIX_DEPOSIT_ADDRESSES: FixSweepAddr[] = FIX_USERS.slice(0, 18)
  .flatMap((u: FixUser, idx) => {
    const out: FixSweepAddr[] = [];
    out.push({
      id: `addr_b_${u.id}`,
      userId: u.id,
      userName: u.name,
      chain: 'bnb',
      address: u.addresses.bnb,
      balanceUSDT: Math.round(addrRand() * 5000 * 100) / 100,
      balanceUSDC: Math.round(addrRand() * 3000 * 100) / 100,
      gasBalance: Math.round(addrRand() * 0.05 * 1000) / 1000,
      lastDepositAt: minutesAgo(20 + idx * 30),
    });
    if (idx % 2 === 0) {
      out.push({
        id: `addr_s_${u.id}`,
        userId: u.id,
        userName: u.name,
        chain: 'sol',
        address: u.addresses.sol,
        balanceUSDT: Math.round(addrRand() * 4000 * 100) / 100,
        balanceUSDC: Math.round(addrRand() * 2000 * 100) / 100,
        gasBalance: Math.round(addrRand() * 0.5 * 1000) / 1000,
        lastDepositAt: minutesAgo(40 + idx * 30),
      });
    }
    return out;
  })
  .filter((a) => a.balanceUSDT + a.balanceUSDC > 100);
