// Reconciliation fixtures — internal ledger vs on-chain balances per account.
// Power the Recon page's drift table.

export interface ReconRow {
  id: string;
  account: string;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  internal: number;
  onchain: number;
  status: 'match' | 'drift';
  note?: string;
}

export const RECON_ROWS: ReconRow[] = [
  {
    id: 'rc_1',
    account: 'BSC Hot Wallet',
    chain: 'bnb',
    token: 'USDT',
    internal: 482_341.55,
    onchain: 482_341.55,
    status: 'match',
  },
  {
    id: 'rc_2',
    account: 'BSC Hot Wallet',
    chain: 'bnb',
    token: 'USDC',
    internal: 318_902.41,
    onchain: 318_902.41,
    status: 'match',
  },
  {
    id: 'rc_3',
    account: 'Solana Hot',
    chain: 'sol',
    token: 'USDT',
    internal: 224_119.07,
    onchain: 224_119.07,
    status: 'match',
  },
  {
    id: 'rc_4',
    account: 'Deposit addr 0x4a…',
    chain: 'bnb',
    token: 'USDT',
    internal: 1_820,
    onchain: 1_820,
    status: 'match',
  },
  {
    id: 'rc_5',
    account: 'Deposit addr 0x7e…',
    chain: 'bnb',
    token: 'USDT',
    internal: 320,
    onchain: 350,
    status: 'drift',
    note: 'On-chain > internal — possible missed deposit',
  },
  {
    id: 'rc_6',
    account: 'Deposit addr Gs9…',
    chain: 'sol',
    token: 'USDC',
    internal: 1_100,
    onchain: 0,
    status: 'drift',
    note: 'Internal > on-chain — user credited but chain empty (swept?)',
  },
  {
    id: 'rc_7',
    account: 'BSC Cold Vault',
    chain: 'bnb',
    token: 'USDT',
    internal: 3_850_200.14,
    onchain: 3_850_200.14,
    status: 'match',
  },
];
