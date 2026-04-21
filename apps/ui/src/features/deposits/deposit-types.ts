// Deposit domain types — shared within the deposits feature.
// Moved from _shared/fixtures when fixture tree was removed (N1).

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
