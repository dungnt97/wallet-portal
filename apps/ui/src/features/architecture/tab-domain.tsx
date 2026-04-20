// Tab: domain model — entity cards + ledger invariants.
// Ported from prototype ArchData in page_architecture.jsx.
import { I } from '@/icons';

interface Entity {
  name: string;
  fields: string[];
  rels: string;
}

const ENTITIES: Entity[] = [
  {
    name: 'User',
    fields: ['id (uuid)', 'email', 'kyc_tier', 'status', 'created_at'],
    rels: 'has_many: addresses, deposits, ledger_entries',
  },
  {
    name: 'Address',
    fields: ['id', 'user_id', 'chain', 'token', 'address (unique)', 'derivation_path', 'status'],
    rels: 'belongs_to: user · enum chain: [bnb, sol]',
  },
  {
    name: 'Deposit',
    fields: [
      'id',
      'user_id',
      'address_id',
      'chain',
      'token',
      'amount',
      'tx_hash',
      'log_index',
      'block_number',
      'confirmations',
      'status',
    ],
    rels: 'unique(chain, tx_hash, log_index)',
  },
  {
    name: 'LedgerEntry',
    fields: [
      'id',
      'user_id',
      'asset',
      'amount (signed)',
      'direction',
      'reference_type',
      'reference_id',
      'balance_after',
    ],
    rels: 'append-only · partition by month',
  },
  {
    name: 'SweepBatch',
    fields: [
      'id',
      'chain',
      'status',
      'address_count',
      'total_usdt',
      'total_usdc',
      'fee',
      'idempotency_key',
      'created_by',
    ],
    rels: 'has_many: sweep_transactions, deposits',
  },
  {
    name: 'WithdrawalRequest',
    fields: [
      'id',
      'chain',
      'token',
      'amount',
      'destination',
      'memo',
      'status',
      'risk_score',
      'requested_by',
      'multisig_op_id',
      'tx_hash',
    ],
    rels: 'belongs_to: multisig_operation',
  },
  {
    name: 'MultisigOperation',
    fields: [
      'id',
      'withdrawal_id',
      'chain',
      'safe_address',
      'nonce',
      'required_sigs',
      'collected_sigs',
      'status',
      'expires_at',
      'tx_hash',
    ],
    rels: 'has_many: signatures',
  },
  {
    name: 'Transaction',
    fields: [
      'id',
      'chain',
      'tx_hash',
      'block_number',
      'from',
      'to',
      'token',
      'amount',
      'fee',
      'status',
      'type',
    ],
    rels: 'unique(chain, tx_hash)',
  },
  {
    name: 'AdminUser',
    fields: ['id', 'email', 'role', 'mfa_enabled', 'last_login_at', 'status'],
    rels: 'enum role: [viewer, operator, treasurer, admin]',
  },
  {
    name: 'AuditLog',
    fields: [
      'id',
      'actor_id',
      'actor_type',
      'action',
      'subject_type',
      'subject_id',
      'metadata (jsonb)',
      'ip',
    ],
    rels: 'append-only · index on (actor_id, created_at)',
  },
];

export function TabDomain() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Domain model</h3>
        <p>
          Token-first design. Every ledger entry references both an asset (USDT/USDC) and a chain.
          No native asset balances are credited — gas is paid from a separate tank wallet.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {ENTITIES.map((e) => (
            <div key={e.name} className="card" style={{ padding: 14 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="fw-600 text-sm">{e.name}</span>
                <I.Database size={12} className="text-faint" />
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                }}
              >
                {e.fields.map((f) => (
                  <div key={f}>· {f}</div>
                ))}
              </div>
              <div
                className="text-xs text-faint"
                style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}
              >
                {e.rels}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="arch-section">
        <h3>Ledger invariants</h3>
        <div className="card" style={{ padding: 16 }}>
          <ul
            className="text-sm text-muted"
            style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}
          >
            <li>
              Sum of <code className="text-mono">user_balance</code> ledger entries == sum of
              credited deposits − completed withdrawals (per asset, per chain).
            </li>
            <li>
              Address sum + treasury balance + in-flight withdrawals == total custody. Reconciler
              runs hourly; alerts on drift.
            </li>
            <li>Every state-mutating endpoint requires an idempotency key; stored 7 days.</li>
            <li>
              All amounts stored as integers in smallest unit (microUSD); displayed as decimals
              only.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
