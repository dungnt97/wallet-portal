// Tab: service map — SVG service diagram + component list + non-goals.
// Ported from prototype ArchOverview in page_architecture.jsx.
import { I } from '@/icons';
import { ServiceMapDiagram } from './service-map-diagram';

const COMPONENTS = [
  {
    name: 'Admin UI',
    desc: 'React + Vite. Staff-only. Google SSO on login, WebAuthn step-up for every write action. Internal DNS only (portal.wallets.internal).',
  },
  {
    name: 'Admin API (Node)',
    desc: 'Fastify + TypeScript + Postgres. Owns ledger, audit, RBAC, withdrawal/sweep/user endpoints. Single source of truth for accounting.',
  },
  {
    name: 'Wallet Engine (Node)',
    desc: 'Fastify + TypeScript. HD address derivation, tx build/sign/broadcast, block watcher, confirmations. Isolated VPC subnet.',
  },
  {
    name: 'Policy Engine (Go)',
    desc: 'Independent pre-sign guard. Runs authorized-signer, daily limits, destination whitelist, time-lock, expiry checks.',
  },
  {
    name: 'Safe (BNB)',
    desc: 'Gnosis Safe v1.4 · 2-of-3 Treasurer multisig. EIP-712 SafeTx signatures via Safe Transaction Service, executed by any signer.',
  },
  {
    name: 'Squads (Solana)',
    desc: 'Squads Protocol v4 multisig PDA. Proposal → Approve instructions signed Ed25519; any signer executes once threshold met.',
  },
  {
    name: 'Ledger HW (per signer)',
    desc: 'Each Treasurer holds a Ledger Nano X. Private keys never leave the device.',
  },
  {
    name: 'Google Workspace',
    desc: 'Identity provider. OIDC SSO. No password in our DB for admins.',
  },
  {
    name: 'WebAuthn / TOTP',
    desc: 'Second factor. WebAuthn preferred; TOTP fallback. Required on login + step-up on every mutation.',
  },
  {
    name: 'Job Queue',
    desc: 'Redis + BullMQ. Every job has an idempotency key, per-class retry policy.',
  },
  {
    name: 'Postgres',
    desc: 'Users, addresses, deposits, ledger, audit, policies. Double-entry ledger. Serializable isolation on credit paths.',
  },
  {
    name: 'Vault / KMS',
    desc: 'HD master seed for address derivation and the single hot signer that sweeps deposits.',
  },
  {
    name: 'Wallet Registry',
    desc: 'Pre-registered staff → (evmAddr, solAddr). Only addresses in this list can sign multisig operations.',
  },
  {
    name: 'Block watcher',
    desc: 'Runs inside Wallet Engine. Polls per chain (BNB 3s · SOL 1s), emits deposit events into the queue.',
  },
];

const NON_GOALS = [
  {
    t: 'Ruby / Rails',
    d: 'Earlier draft split backend across Rails + Node. Collapsed to Node/TS for both processes. Shared types via a /contracts package.',
  },
  {
    t: 'WalletConnect',
    d: 'Admin runs on company laptops with MetaMask/Phantom browser extensions. WalletConnect is a mobile-bridge concern — not needed.',
  },
  {
    t: 'Separate chain-adapter services',
    d: 'EVM and Solana calls are library imports inside the Wallet Engine, not standalone services.',
  },
  {
    t: 'Tenderly simulation',
    d: 'Our outbound = ERC-20 transfer or SPL transfer. Policy Engine already does balance + whitelist + daily-limit checks.',
  },
  {
    t: 'KYT (Chainalysis/TRM)',
    d: 'Internal treasury only. Destination whitelist + manual approval covers current compliance posture.',
  },
  { t: 'Dual queues (Sidekiq + BullMQ)', d: 'One runtime = one queue library. BullMQ only.' },
];

export function TabServiceMap() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Service map</h3>
        <p>
          Two-process backbone, both Node/TypeScript. <b>Admin API</b> owns business logic, ledger,
          auth; <b>Wallet Engine</b> owns blockchain I/O. They talk via shared Postgres and a BullMQ
          queue on Redis. A small <b>Policy Engine</b> (Go) sits in front of every signing path as
          an independent guard.
        </p>
        <div className="arch-diagram">
          <ServiceMapDiagram />
        </div>
      </div>

      <div className="arch-section">
        <h3>Components</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {COMPONENTS.map((c) => (
            <div key={c.name} className="card" style={{ padding: 14 }}>
              <div className="fw-600 text-sm">{c.name}</div>
              <div className="text-xs text-muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
                {c.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="arch-section">
        <h3>What we deliberately don't use</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {NON_GOALS.map((c) => (
            <div key={c.t} className="card" style={{ padding: 14, background: 'var(--bg-sunken)' }}>
              <div className="fw-600 text-sm">{c.t}</div>
              <div className="text-xs text-muted" style={{ marginTop: 4, lineHeight: 1.55 }}>
                {c.d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="arch-section">
        <h3>Sync vs async boundaries</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="hstack" style={{ marginBottom: 8 }}>
              <I.Zap size={14} style={{ color: 'var(--accent)' }} />
              <span className="fw-600 text-sm">Synchronous (HTTP)</span>
            </div>
            <ul
              className="text-sm text-muted"
              style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}
            >
              <li>Admin reads (lists, balances, details)</li>
              <li>Address generation on user create</li>
              <li>Multisig status polling (UI refresh)</li>
              <li>Health checks</li>
            </ul>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="hstack" style={{ marginBottom: 8 }}>
              <I.Clock size={14} style={{ color: 'var(--warn)' }} />
              <span className="fw-600 text-sm">Asynchronous (jobs)</span>
            </div>
            <ul
              className="text-sm text-muted"
              style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}
            >
              <li>Deposit detection &amp; confirmation</li>
              <li>Ledger crediting</li>
              <li>Sweep tx building &amp; broadcasting</li>
              <li>Multisig submission &amp; tracking</li>
              <li>Audit log fan-out</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
