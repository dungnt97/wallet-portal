// Transaction feed fixtures — unified deposits + withdrawals + sweep records.
// FIX_TRANSACTIONS is the legacy slim shape; FIX_TRANSACTIONS_FULL includes
// from/to/block/fee and powers the Transactions page.
import { minutesAgo } from '../helpers';
import { FIX_DEPOSITS } from './deposits';
import { evmAddr, evmHash, mul32, solAddr, solSig } from './random';
import { FIX_WITHDRAWALS } from './withdrawals';

// Legacy slim feed (dashboard recent activity).
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

const fullRand = mul32(919191);

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
    from: w.chain === 'bnb' ? evmAddr(fullRand) : solAddr(fullRand),
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
      amount: Math.round(fullRand() * 8000 * 100) / 100,
      from: chain === 'bnb' ? evmAddr(fullRand) : solAddr(fullRand),
      to: chain === 'bnb' ? evmAddr(fullRand) : solAddr(fullRand),
      txHash: chain === 'bnb' ? evmHash(fullRand) : solSig(fullRand),
      status: (i === 2 ? 'failed' : 'confirmed') as TxStatus,
      blockNumber: 38_200_000 + i * 22,
      timestamp: minutesAgo(20 + i * 53),
      fee: chain === 'bnb' ? 0.0011 : 0.000005,
    };
  }),
].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
