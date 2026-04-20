// Failed-transaction fixtures used by the Recovery page.
import { minutesAgo } from '../helpers';

export interface FailedTx {
  id: string;
  kind: 'withdrawal' | 'sweep';
  chain: 'bnb' | 'sol';
  amount: number;
  token: 'USDT' | 'USDC';
  reason: string;
  hash: string;
  failedAt: string;
  canBumpFee: boolean;
  canRetry: boolean;
  canCancel: boolean;
}

export const FAILED_TXS: FailedTx[] = [
  {
    id: 'fx_1',
    kind: 'withdrawal',
    chain: 'bnb',
    amount: 8_400,
    token: 'USDT',
    reason: 'Out of gas (nonce 1842)',
    hash: `0x${'e1'.repeat(32)}`,
    failedAt: minutesAgo(22),
    canBumpFee: true,
    canRetry: true,
    canCancel: true,
  },
  {
    id: 'fx_2',
    kind: 'sweep',
    chain: 'bnb',
    amount: 1_120,
    token: 'USDT',
    reason: 'Nonce conflict',
    hash: `0x${'e2'.repeat(32)}`,
    failedAt: minutesAgo(88),
    canBumpFee: false,
    canRetry: true,
    canCancel: false,
  },
  {
    id: 'fx_3',
    kind: 'withdrawal',
    chain: 'sol',
    amount: 12_400,
    token: 'USDC',
    reason: 'Blockhash expired',
    hash: `SolHash${'x'.repeat(82)}`,
    failedAt: minutesAgo(14 * 60),
    canBumpFee: false,
    canRetry: true,
    canCancel: true,
  },
  {
    id: 'fx_4',
    kind: 'sweep',
    chain: 'bnb',
    amount: 540,
    token: 'USDC',
    reason: 'Insufficient gas on addr',
    hash: `0x${'e4'.repeat(32)}`,
    failedAt: minutesAgo(2 * 24 * 60),
    canBumpFee: false,
    canRetry: true,
    canCancel: false,
  },
];
