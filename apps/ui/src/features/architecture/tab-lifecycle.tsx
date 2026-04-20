// Tab: lifecycle flows — deposit, sweep, withdrawal step lists.
// Ported from prototype ArchFlows in page_architecture.jsx.
import { I } from '@/icons';

const DEPOSIT_STEPS: [string, string][] = [
  [
    'Address assigned',
    'On user creation, derive next index from HD seed for each chain. Store path + pubkey only; private key stays in KMS.',
  ],
  [
    'Block scanned',
    'Watcher polls latest block (BNB every 3s, Solana every 1s). Filters ERC-20 / SPL transfer logs by destination address.',
  ],
  [
    'Deposit recorded',
    'Insert deposit row with status=pending, dedupe on (chain, txHash, logIndex). Idempotency guarantees no double-credit.',
  ],
  [
    'Confirmations counted',
    'BNB: 15 blocks finality. Solana: confirmed commitment (≈32 slots). Watcher updates confirmation count each tick.',
  ],
  ['Ledger credited', 'Atomically: status=credited + double-entry ledger row. Emits domain event.'],
  ['Visible in admin UI', 'Subscribed via WebSocket; appears in Deposits table with risk flag.'],
  [
    'Awaits sweep',
    'Address balance accumulates; when threshold reached, surfaced in Sweep page. No automatic sweeping.',
  ],
];

const SWEEP_STEPS: [string, string][] = [
  ['Admin selects deposits', 'In Sweep page, multi-select addresses above threshold.'],
  [
    'SweepBatch created',
    'API persists batch with idempotency key. Status=building. Audit log entry recorded.',
  ],
  [
    'Build transactions',
    'EVM: top up gas then ERC-20 transferFrom. Solana: build versioned tx; close ATA after sweep.',
  ],
  [
    'Sign & broadcast',
    'Node engine signs with derived child key (BNB) or fee-payer wallet (Solana). Broadcast in parallel.',
  ],
  ['Track confirmations', 'BullMQ job polls each tx. On confirmation, update batch status.'],
  [
    'Reconcile',
    'Update address balances, mark related deposits status=swept, write treasury credit ledger entry.',
  ],
];

const WITHDRAWAL_STEPS: [string, string][] = [
  [
    'Admin creates request',
    'Withdrawals page form: chain, asset, amount, destination, memo. Balance + checksum validation.',
  ],
  [
    'Tx payload built',
    'Engine builds unsigned ERC-20 transfer (BNB) or SPL transfer instruction (Solana).',
  ],
  [
    'Submitted to multisig',
    'BNB: POST to Safe Transaction Service. Solana: createInstruction via Squads SDK.',
  ],
  ['Signers approve', 'Other admins sign in their respective UIs. Tracker polls every 30s.'],
  [
    'Threshold reached',
    'When required signatures collected, status=ready. Admin clicks "Execute".',
  ],
  ['Executed on-chain', 'Multisig contract submits the transfer. Tx hash captured.'],
  [
    'Reconciled',
    'On confirmation: ledger debit treasury, withdrawal status=completed, audit log written.',
  ],
];

function FlowSteps({ steps }: { steps: [string, string][] }) {
  return (
    <div className="flow-steps">
      {steps.map(([t, d]) => (
        <div key={t} className="flow-step">
          <div>
            <div className="flow-step-title">{t}</div>
            <div className="flow-step-desc">{d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TabLifecycle() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Deposit lifecycle</h3>
        <p>
          From the moment a user-facing address receives a token transfer until the funds are
          reconciled into the user's internal balance.
        </p>
        <FlowSteps steps={DEPOSIT_STEPS} />
        <div className="alert warn" style={{ marginTop: 12 }}>
          <I.AlertTri size={14} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">Edge cases handled</div>
            <div className="alert-text">
              RPC reorg → mark deposit reverted, debit ledger. Duplicate event → idempotency key
              drops it. Stuck pending → cron promotes to manual review after 6h.
            </div>
          </div>
        </div>
      </div>

      <div className="arch-section">
        <h3>Sweep lifecycle (admin-driven)</h3>
        <FlowSteps steps={SWEEP_STEPS} />
      </div>

      <div className="arch-section">
        <h3>Withdrawal + multisig lifecycle</h3>
        <FlowSteps steps={WITHDRAWAL_STEPS} />
      </div>
    </div>
  );
}
