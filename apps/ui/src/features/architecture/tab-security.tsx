// Tab: security — controls matrix + failure handling.
// Ported from prototype ArchSecurity in page_architecture.jsx.
import { I } from '@/icons';

const CONTROLS: [title: string, desc: string][] = [
  [
    'Key custody',
    'HD master seed lives in HashiCorp Vault (or AWS KMS). Node engine derives child keys per address; never persists a private key. Multisig signing keys held by signer admins on hardware wallets.',
  ],
  [
    'Signer isolation',
    'Sweep signing happens inside a dedicated "signer" container with no inbound network. Only outbound to RPC. Receives unsigned tx via Redis stream, returns signed tx.',
  ],
  [
    'Admin auth',
    'SSO (Google Workspace) + mandatory WebAuthn step-up for any write action. Session 12h. RBAC: viewer · operator · treasurer · admin.',
  ],
  [
    'RBAC matrix',
    'viewer → read all. operator → create sweep + withdrawal drafts. treasurer → submit + approve. admin → user/role config. All step-up actions require fresh WebAuthn within 5min.',
  ],
  [
    'Audit log',
    'Append-only Postgres table + nightly write to S3 with object-lock (compliance retention). Every mutation includes actor, IP, request ID, before/after hashes.',
  ],
  [
    'Network',
    'Backend in private VPC. Public ingress only via WAF + admin IP allowlist. Outbound to RPCs through NAT with allowlist. No customer-facing endpoints.',
  ],
  [
    'Idempotency',
    'Every write endpoint requires Idempotency-Key. Server stores key + response for 7d. Replays return cached response without re-executing.',
  ],
  [
    'Secrets',
    'No secrets in code or env vars. Vault dynamic creds with 1h TTL. RPC API keys rotated weekly via job.',
  ],
];

const FAILURES: [title: string, desc: string][] = [
  [
    'RPC failure',
    'Round-robin pool with primary/backup. Health pings every 30s; bad endpoints quarantined for 5min. Watcher backfills missed blocks on recovery.',
  ],
  [
    'Duplicate events',
    'Unique index on (chain, tx_hash, log_index) at deposit insert. Upserts on watcher restart. Job idempotency keys prevent double-credit.',
  ],
  [
    'Tx fail (revert)',
    'Sweep: marked partial, retry button in UI. Withdrawal: Multisig op marked failed, ledger untouched, admin notified.',
  ],
  [
    'Multisig stuck',
    'TTL on operations (default 24h); auto-cancel after expiry, withdrawal goes back to draft. Stuck signers surfaced in Multisig page.',
  ],
  [
    'Reorg (BNB)',
    'Watcher tracks confirmation depth; 15-block reorg threshold. If reorg drops a credited deposit, system enters frozen state and pages on-call.',
  ],
  [
    'DB lock contention',
    'Ledger writes use SERIALIZABLE isolation on a per-user advisory lock. Conflicts retry up to 3 times; then fail loud.',
  ],
];

export function TabSecurity() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Security model</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {CONTROLS.map(([t, d]) => (
            <div key={t} className="card" style={{ padding: 14 }}>
              <div className="hstack" style={{ marginBottom: 6 }}>
                <I.Shield size={14} style={{ color: 'var(--accent)' }} />
                <span className="fw-600 text-sm">{t}</span>
              </div>
              <div className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="arch-section">
        <h3>Failure handling</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {FAILURES.map(([t, d]) => (
            <div key={t} className="card" style={{ padding: 14 }}>
              <div className="hstack" style={{ marginBottom: 6 }}>
                <I.AlertTri size={14} style={{ color: 'var(--warn)' }} />
                <span className="fw-600 text-sm">{t}</span>
              </div>
              <div className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
