// Sequence diagram fixtures — deposit, withdrawal, sweep, rebalance timelines.
// Ported from prototype page_arch_sequence.jsx.

export type MessageKind = 'sync' | 'async' | 'return' | 'note' | 'self';
export type ActorTone =
  | 'neutral'
  | 'ruby'
  | 'node'
  | 'chain'
  | 'db'
  | 'external'
  | 'policy'
  | 'treasurer'
  | 'queue';

export interface Actor {
  id: string;
  label: string;
  tone: ActorTone;
}

export interface Message {
  from?: string;
  to?: string;
  label?: string;
  kind?: MessageKind;
  note?: string;
  span?: [number, number];
  group?: string;
}

export interface Sequence {
  id: string;
  title: string;
  subtitle: string;
  actors: Actor[];
  messages: Message[];
}

export const SEQUENCES: Sequence[] = [
  {
    id: 'deposit',
    title: 'Deposit detection & crediting',
    subtitle: 'User sends funds → chain watcher → policy check → ledger credit',
    actors: [
      { id: 'user', label: 'User wallet', tone: 'neutral' },
      { id: 'chain', label: 'Blockchain', tone: 'chain' },
      { id: 'watcher', label: 'Chain watcher', tone: 'node' },
      { id: 'queue', label: 'Job queue', tone: 'queue' },
      { id: 'api', label: 'Admin API', tone: 'ruby' },
      { id: 'kyt', label: 'KYT provider', tone: 'external' },
      { id: 'ledger', label: 'Ledger (Postgres)', tone: 'db' },
      { id: 'notif', label: 'Notifications', tone: 'external' },
    ],
    messages: [
      { from: 'user', to: 'chain', label: 'transfer(USDT, deposit_addr)', kind: 'async' },
      { from: 'chain', to: 'watcher', label: 'new block → log match', kind: 'async' },
      { from: 'watcher', to: 'queue', label: 'enqueue deposit.detected', kind: 'async' },
      { from: 'queue', to: 'api', label: 'deposit.detected{tx,amount,addr}', kind: 'sync' },
      { from: 'api', to: 'ledger', label: 'INSERT deposit(pending)', kind: 'sync' },
      { from: 'api', to: 'kyt', label: 'screen(fromAddr)', kind: 'sync' },
      { from: 'kyt', to: 'api', label: 'clean ✓', kind: 'return' },
      { from: 'api', to: 'notif', label: 'emit user.deposit.pending', kind: 'async' },
      { note: 'Wait for N confirmations (15 BNB / 32 SOL)', span: [1, 2] },
      { from: 'watcher', to: 'queue', label: 'enqueue deposit.confirmed', kind: 'async' },
      { from: 'queue', to: 'api', label: 'deposit.confirmed', kind: 'sync' },
      { from: 'api', to: 'ledger', label: 'UPDATE deposit → credited', kind: 'sync' },
      { from: 'api', to: 'notif', label: 'emit user.deposit.credited', kind: 'async' },
    ],
  },
  {
    id: 'withdrawal',
    title: 'Withdrawal with 2-of-3 multisig',
    subtitle: 'Operator creates request → Treasurers sign → executor broadcasts',
    actors: [
      { id: 'op', label: 'Operator', tone: 'neutral' },
      { id: 'api', label: 'Admin API', tone: 'ruby' },
      { id: 'policy', label: 'Policy Engine', tone: 'policy' },
      { id: 't1', label: 'Treasurer #1', tone: 'treasurer' },
      { id: 't2', label: 'Treasurer #2', tone: 'treasurer' },
      { id: 'safe', label: 'Safe contract', tone: 'chain' },
      { id: 'exec', label: 'Executor', tone: 'node' },
      { id: 'ledger', label: 'Ledger', tone: 'db' },
    ],
    messages: [
      { from: 'op', to: 'api', label: 'POST /withdrawals', kind: 'sync' },
      { from: 'api', to: 'policy', label: 'evaluate(amount, dest, velocity)', kind: 'sync' },
      { from: 'policy', to: 'api', label: 'ok · requires 2/3 sigs', kind: 'return' },
      { from: 'api', to: 'ledger', label: 'INSERT withdrawal(awaiting_signatures)', kind: 'sync' },
      { from: 'api', to: 't1', label: 'notify: pending signature', kind: 'async' },
      { from: 'api', to: 't2', label: 'notify: pending signature', kind: 'async' },
      { note: 'Treasurers review independently', span: [2, 4] },
      { from: 't1', to: 'safe', label: 'approveHash · sig₁', kind: 'sync', group: 'sign-1' },
      { from: 'safe', to: 't1', label: 'stored', kind: 'return' },
      { from: 't2', to: 'safe', label: 'approveHash · sig₂', kind: 'sync', group: 'sign-2' },
      { from: 'safe', to: 't2', label: 'threshold reached ✓', kind: 'return' },
      { from: 'api', to: 'exec', label: 'enqueue execute(op_id)', kind: 'async' },
      { from: 'exec', to: 'safe', label: 'execTransaction(sigs)', kind: 'sync', group: 'exec' },
      { from: 'safe', to: 'exec', label: 'txHash · receipt', kind: 'return' },
      { from: 'exec', to: 'ledger', label: 'UPDATE withdrawal → executed', kind: 'sync' },
    ],
  },
  {
    id: 'sweep',
    title: 'Batched sweep to hot wallet',
    subtitle: 'Operator selects addresses → executor bundles txs → hot wallet consolidates',
    actors: [
      { id: 'op', label: 'Operator', tone: 'neutral' },
      { id: 'api', label: 'Admin API', tone: 'ruby' },
      { id: 'policy', label: 'Policy Engine', tone: 'policy' },
      { id: 'exec', label: 'Executor', tone: 'node' },
      { id: 'kms', label: 'KMS (deposit keys)', tone: 'external' },
      { id: 'chain', label: 'Blockchain', tone: 'chain' },
      { id: 'ledger', label: 'Ledger', tone: 'db' },
    ],
    messages: [
      { from: 'op', to: 'api', label: 'POST /sweeps (addr_ids, token)', kind: 'sync' },
      { from: 'api', to: 'policy', label: 'rate-limit check · gas budget', kind: 'sync' },
      { from: 'policy', to: 'api', label: 'ok', kind: 'return' },
      { from: 'api', to: 'exec', label: 'enqueue sweep.batch(b_id)', kind: 'async' },
      { note: 'Per-address, serialized — one nonce per addr', span: [3, 4] },
      { from: 'exec', to: 'kms', label: 'sign(privateKey_i, tx_i)', kind: 'sync' },
      { from: 'kms', to: 'exec', label: 'signature', kind: 'return' },
      { from: 'exec', to: 'chain', label: 'sendRawTransaction(tx_i)', kind: 'sync' },
      { from: 'chain', to: 'exec', label: 'tx_hash_i', kind: 'return' },
      { from: 'chain', to: 'exec', label: 'all confirmations received', kind: 'async' },
      { from: 'exec', to: 'ledger', label: 'UPDATE batch → completed', kind: 'sync' },
    ],
  },
  {
    id: 'rebalance',
    title: 'Hot → Cold rebalance',
    subtitle: 'Band monitor detects excess → proposes move → 2/3 sign → hot sends',
    actors: [
      { id: 'mon', label: 'Band monitor', tone: 'node' },
      { id: 'api', label: 'Admin API', tone: 'ruby' },
      { id: 'op', label: 'Operator', tone: 'neutral' },
      { id: 't12', label: 'Treasurers', tone: 'treasurer' },
      { id: 'safe', label: 'Hot Safe', tone: 'chain' },
      { id: 'cold', label: 'Cold Vault', tone: 'chain' },
    ],
    messages: [
      { from: 'mon', to: 'api', label: 'alert: hot > ceiling', kind: 'async' },
      { from: 'api', to: 'op', label: 'suggest rebalance · $180K', kind: 'async' },
      { from: 'op', to: 'api', label: 'propose rebalance', kind: 'sync' },
      { from: 'api', to: 't12', label: 'notify 3 Treasurers', kind: 'async' },
      { from: 't12', to: 'safe', label: 'sign × 2', kind: 'sync' },
      { from: 'safe', to: 'cold', label: 'transfer(excess)', kind: 'sync' },
      { from: 'cold', to: 'safe', label: 'receipt', kind: 'return' },
      { from: 'safe', to: 'api', label: 'emit rebalance.completed', kind: 'async' },
    ],
  },
];

export const ACTOR_TONE: Record<ActorTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: 'var(--bg-sunken)', border: 'var(--line)', text: 'var(--text)' },
  ruby: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  node: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  chain: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a' },
  db: { bg: '#fdf4ff', border: '#f5d0fe', text: '#86198f' },
  external: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  policy: { bg: '#f0fdf4', border: '#86efac', text: '#14532d' },
  treasurer: { bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3' },
  queue: { bg: '#f8fafc', border: '#cbd5e1', text: '#334155' },
};
