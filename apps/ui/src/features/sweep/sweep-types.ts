// Sweep domain types — shared within the sweep feature.
// Moved from _shared/fixtures when fixture tree was removed (N1).

export interface FixSweepAddr {
  id: string;
  userId: string;
  userName: string;
  chain: 'bnb' | 'sol';
  address: string;
  balanceUSDT: number;
  balanceUSDC: number;
  gasBalance: number;
  lastDepositAt: string | null;
}
