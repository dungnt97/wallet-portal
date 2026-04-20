// Sweep batch history — past executed batches across chains.
import { minutesAgo } from '../helpers';

export interface SweepBatch {
  id: string;
  chain: 'bnb' | 'sol';
  addresses: number;
  total: number;
  fee: number;
  status: 'completed' | 'partial';
  createdAt: string;
  executedAt: string;
}

export const INITIAL_SWEEP_BATCHES: SweepBatch[] = [
  {
    id: 'b_8112',
    chain: 'bnb',
    addresses: 6,
    total: 12_840.55,
    fee: 0.018,
    status: 'completed',
    createdAt: minutesAgo(120),
    executedAt: minutesAgo(115),
  },
  {
    id: 'b_8111',
    chain: 'sol',
    addresses: 4,
    total: 8_220.1,
    fee: 0.000012,
    status: 'completed',
    createdAt: minutesAgo(220),
    executedAt: minutesAgo(218),
  },
  {
    id: 'b_8104',
    chain: 'bnb',
    addresses: 6,
    total: 14_018.2,
    fee: 0.022,
    status: 'partial',
    createdAt: minutesAgo(96 * 60),
    executedAt: minutesAgo(96 * 60 - 2),
  },
];
