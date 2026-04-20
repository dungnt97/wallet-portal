// Prototype-compatible fixture data — deterministic, mirrors shapes from
// portal/src/data.jsx so the ported pages render even when API is empty.
// Used ONLY as fallback when TanStack Query returns nothing.
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
const rand = mul32(424242);
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

const NAMES = [
  'Aiko Tanaka',
  'Marcus Chen',
  'Priya Iyer',
  'Lena Vogel',
  'Ravi Krishnan',
  'Mei Wong',
  'David Park',
  'Sara Kowalski',
  'Hugo Muller',
  'Elif Demir',
  'Jakub Novak',
  'Yumi Sato',
  'Omar Haddad',
  'Nora Lindqvist',
  'Arman Ali',
  'Tessa Bakker',
  'Simo Heikkinen',
  'Iris Berg',
  'Kenji Mori',
  'Carla Ferreira',
];

export interface FixUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  kycTier: string;
  addresses: { bnb: string; sol: string };
  balances: { USDT: number; USDC: number };
  risk: 'low' | 'med' | 'high';
}

export const FIX_USERS: FixUser[] = Array.from({ length: 20 }, (_, i) => {
  const name = NAMES[i % NAMES.length] as string;
  return {
    id: `usr_${(1000 + i).toString(36)}`,
    name,
    email: `${name.toLowerCase().replace(/\s/g, '.')}@example.io`,
    initials: name
      .split(' ')
      .map((s) => s[0])
      .join(''),
    kycTier: pick(['Tier 1', 'Tier 2', 'Tier 2', 'Tier 3']),
    addresses: { bnb: evmAddr(), sol: solAddr() },
    balances: {
      USDT: Math.round(rand() * 50000 * 100) / 100,
      USDC: Math.round(rand() * 30000 * 100) / 100,
    },
    risk: pick(['low', 'low', 'low', 'med', 'low', 'high'] as const),
  };
});

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

export const FIX_DEPOSITS: FixDeposit[] = Array.from({ length: 30 }, (_, i) => {
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
    txHash: chain === 'bnb' ? evmHash() : solSig(),
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

export const ALERTS = [
  {
    id: 'al1',
    severity: 'warn' as const,
    title: 'BNB sweep threshold reached',
    text: '12 deposit addresses now exceed the 500 USDT sweep threshold.',
    when: minutesAgo(8),
  },
  {
    id: 'al2',
    severity: 'info' as const,
    title: 'Multisig op_40003 awaiting 2 signatures',
    text: 'Withdrawal of 12,400 USDT to 0x71C2…fA09 expires in 5h 42m.',
    when: minutesAgo(22),
  },
  {
    id: 'al3',
    severity: 'err' as const,
    title: 'Sweep batch b_8104 partially failed',
    text: '1 of 6 transactions reverted (insufficient gas). Retry available.',
    when: minutesAgo(96),
  },
];
