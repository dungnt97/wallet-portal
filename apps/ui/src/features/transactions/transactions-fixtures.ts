import { FIX_DEPOSITS } from '../_shared/fixtures';
import { FIX_WITHDRAWALS } from '../_shared/fixtures-flows';
// Extended transaction fixtures — includes from/to/block/fee + sweep entries.
// Mirrors prototype data.jsx TRANSACTIONS shape. Keeps Pass 2 _shared intact.
import { minutesAgo } from '../_shared/helpers';

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
const rand = mul32(919191);
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

export type TxStatus = 'confirmed' | 'pending' | 'failed';
export type TxType = 'deposit' | 'withdrawal' | 'sweep';

export interface FixTransaction {
  id: string;
  type: TxType;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: number;
  from: string;
  to: string;
  txHash: string;
  status: TxStatus;
  blockNumber: number;
  timestamp: string;
  fee: number;
}

export const FIX_TRANSACTIONS_FULL: FixTransaction[] = [
  ...FIX_DEPOSITS.filter((d) => d.txHash).map((d, i) => ({
    id: `tx_d_${i}`,
    type: 'deposit' as const,
    chain: d.chain,
    token: d.token,
    amount: d.amount,
    from: '—',
    to: d.address,
    txHash: d.txHash as string,
    status: (d.status === 'pending' ? 'pending' : 'confirmed') as TxStatus,
    blockNumber: d.blockNumber,
    timestamp: d.detectedAt,
    fee: d.chain === 'bnb' ? 0.0008 : 0.000005,
  })),
  ...FIX_WITHDRAWALS.filter((w) => w.txHash).map((w, i) => ({
    id: `tx_w_${i}`,
    type: 'withdrawal' as const,
    chain: w.chain,
    token: w.token,
    amount: w.amount,
    from: w.chain === 'bnb' ? evmAddr() : solAddr(),
    to: w.destination,
    txHash: w.txHash as string,
    status: (w.stage === 'failed'
      ? 'failed'
      : w.stage === 'executing'
        ? 'pending'
        : 'confirmed') as TxStatus,
    blockNumber: 38_100_000 + i * 15,
    timestamp: w.createdAt,
    fee: w.chain === 'bnb' ? 0.0014 : 0.000006,
  })),
  ...Array.from({ length: 8 }, (_, i) => {
    const chain = (i % 2 === 0 ? 'bnb' : 'sol') as 'bnb' | 'sol';
    return {
      id: `tx_s_${i}`,
      type: 'sweep' as const,
      chain,
      token: (i % 2 === 0 ? 'USDT' : 'USDC') as 'USDT' | 'USDC',
      amount: Math.round(rand() * 8000 * 100) / 100,
      from: chain === 'bnb' ? evmAddr() : solAddr(),
      to: chain === 'bnb' ? evmAddr() : solAddr(),
      txHash: chain === 'bnb' ? evmHash() : solSig(),
      status: (i === 2 ? 'failed' : 'confirmed') as TxStatus,
      blockNumber: 38_200_000 + i * 22,
      timestamp: minutesAgo(20 + i * 53),
      fee: chain === 'bnb' ? 0.0011 : 0.000005,
    };
  }),
].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
