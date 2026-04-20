// Tab: MVP plan — phased rollout + anti-patterns.
// Ported from prototype ArchMVP in page_architecture.jsx.

interface Phase {
  label: string;
  timeline: string;
  title: string;
  bullets: string[];
  tone: 'ok' | 'warn' | 'info';
}

const PHASES: Phase[] = [
  {
    label: 'Phase 1',
    timeline: '~3 weeks',
    title: 'BNB · USDT · single-tenant',
    bullets: [
      'HD address derivation',
      'Block watcher + deposit detection',
      'Manual sweep (one address at a time)',
      'Withdrawals via Safe (manual signing)',
      'Admin UI: Dashboard, Deposits, Withdrawals only',
      'Audit log + RBAC scaffolding',
    ],
    tone: 'ok',
  },
  {
    label: 'Phase 2',
    timeline: '~3 weeks',
    title: 'Sweep batching + USDC',
    bullets: [
      'Batched sweep with gas top-up',
      'Add USDC token',
      'Sweep page UI + multi-select',
      'Reconciliation job + drift alerts',
      'Multisig tracker UI',
    ],
    tone: 'warn',
  },
  {
    label: 'Phase 3',
    timeline: '~4 weeks',
    title: 'Solana + risk + ops polish',
    bullets: [
      'Solana adapter + Squads multisig',
      'SPL token sweep with ATA close',
      'KYT integration (Chainalysis or TRM)',
      'WebAuthn step-up',
      'Full audit retention to S3',
    ],
    tone: 'info',
  },
];

const TONE_BORDER: Record<Phase['tone'], string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  info: 'var(--info)',
};

const NON_GOALS: [title: string, body: string][] = [
  [
    'Microservices.',
    "Two processes is enough. Don't split the watcher and the sweeper until you have measurable contention.",
  ],
  ['Auto-sweep.', 'Always require a human. The whole point of the manual gate is reconciliation.'],
  ['Internal multisig.', "Use Safe and Squads. Don't roll your own threshold scheme."],
  ['End-user UX.', 'No mobile, no public API, no end-user notifications. This is internal-only.'],
  ['More chains.', 'BNB + Solana is enough surface area to validate the abstractions.'],
  ['Custom KMS.', "Use Vault or KMS. Don't write key management yourself."],
  [
    'GraphQL.',
    'REST is faster to build and easier to audit. Reach for it when query needs justify it.',
  ],
];

export function TabMvp() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>MVP plan</h3>
        <p>
          Solo developer. Bias towards a small, sturdy core that already exercises every
          architectural seam — chain adapters, queue, ledger, multisig — but on the simplest
          possible asset/chain combo.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {PHASES.map((p) => (
            <div
              key={p.label}
              className="card"
              style={{ padding: 18, borderTop: `3px solid ${TONE_BORDER[p.tone]}` }}
            >
              <div className="hstack" style={{ marginBottom: 8 }}>
                <span className={`badge ${p.tone}`}>{p.label}</span>
                <span className="text-xs text-faint">{p.timeline}</span>
              </div>
              <div className="fw-600" style={{ fontSize: 15, marginBottom: 8 }}>
                {p.title}
              </div>
              <ul
                className="text-sm text-muted"
                style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}
              >
                {p.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="arch-section">
        <h3>What NOT to build yet</h3>
        <div className="card" style={{ padding: 18 }}>
          <ul
            className="text-sm text-muted"
            style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}
          >
            {NON_GOALS.map(([t, d]) => (
              <li key={t}>
                <strong className="text-mono" style={{ color: 'var(--text)' }}>
                  {t}
                </strong>{' '}
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
