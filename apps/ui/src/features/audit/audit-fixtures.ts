// Audit log fixtures — ports prototype data.jsx AUDIT_LOG shape.
import { minutesAgo } from '../_shared/helpers';

export type Severity = 'normal' | 'info' | 'warn';

export interface AuditEntry {
  id: string;
  action: string;
  subject: string;
  actor: string;
  ip: string;
  timestamp: string;
  severity: Severity;
}

export interface LoginEvent {
  id: string;
  staffId: string;
  name: string;
  email: string;
  role: string;
  at: string;
  ip: string;
  ua: string;
}

const ACTIONS = [
  { action: 'sweep.batch.created', subject: 'BatchID b_8112', actor: 'mira@treasury.io' },
  { action: 'withdrawal.created', subject: 'wd_30009 — 12,400 USDT', actor: 'ben@treasury.io' },
  { action: 'multisig.signed', subject: 'op_40003', actor: 'hana@treasury.io' },
  { action: 'user.created', subject: 'usr_jp82', actor: 'ana@treasury.io' },
  { action: 'address.generated', subject: 'BNB / usr_kk1l', actor: 'system' },
  { action: 'deposit.credited', subject: 'dep_2008f — 1,820 USDC', actor: 'system' },
  { action: 'withdrawal.executed', subject: 'wd_30002', actor: 'system' },
  { action: 'auth.login', subject: 'mira@treasury.io', actor: 'mira@treasury.io' },
  { action: 'rpc.failover', subject: 'BNB primary → backup', actor: 'system' },
  { action: 'sweep.batch.executed', subject: 'BatchID b_8109', actor: 'system' },
  {
    action: 'admin.role.updated',
    subject: 'ben@treasury.io → operator',
    actor: 'mira@treasury.io',
  },
  { action: 'withdrawal.cancelled', subject: 'wd_30005', actor: 'mira@treasury.io' },
  { action: 'config.updated', subject: 'sweep.threshold = 500 USDT', actor: 'mira@treasury.io' },
  { action: 'deposit.detected', subject: 'dep_20012 — 530 USDT', actor: 'system' },
  { action: 'multisig.executed', subject: 'op_40001', actor: 'system' },
  { action: 'auth.login', subject: 'ben@treasury.io', actor: 'ben@treasury.io' },
  { action: 'user.kyc.updated', subject: 'usr_le2x → Tier 3', actor: 'ana@treasury.io' },
  { action: 'sweep.address.added', subject: 'addr_b_usr_pa1m', actor: 'mira@treasury.io' },
];

function severityOf(action: string): Severity {
  if (action.includes('failover') || action.includes('cancelled')) return 'warn';
  if (action.includes('executed') || action.includes('login')) return 'info';
  return 'normal';
}

export const AUDIT_LOG: AuditEntry[] = Array.from({ length: 60 }, (_, i) => {
  const a = ACTIONS[i % ACTIONS.length] as (typeof ACTIONS)[number];
  return {
    id: `log_${(50000 + i).toString(36)}`,
    action: a.action,
    subject: a.subject,
    actor: a.actor,
    ip: `${10 + (i % 200)}.${20 + ((i * 3) % 200)}.${(i * 7) % 255}.${(i * 11) % 255}`,
    timestamp: minutesAgo(2 + i * 11),
    severity: severityOf(a.action),
  };
});

export const FIXTURE_LOGIN_HISTORY: LoginEvent[] = [
  {
    id: 'lg_1a2b3c',
    staffId: 'stf_mira',
    name: 'Mira Sato',
    email: 'mira@treasury.io',
    role: 'admin',
    at: minutesAgo(12),
    ip: '10.42.18.14',
    ua: 'Chrome on macOS',
  },
  {
    id: 'lg_4d5e6f',
    staffId: 'stf_ben',
    name: 'Ben Foster',
    email: 'ben@treasury.io',
    role: 'treasurer',
    at: minutesAgo(60 * 2),
    ip: '10.42.18.22',
    ua: 'Firefox on Linux',
  },
];
