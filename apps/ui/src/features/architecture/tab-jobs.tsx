// Tab: background jobs — BullMQ worker catalogue.
// Ported from prototype ArchJobs in page_architecture.jsx.

type Owner = 'Node' | 'Admin API';
type Row = [name: string, owner: Owner, trigger: string, freq: string, retry: string];

const JOBS: Row[] = [
  ['BlockchainWatcher::ScanBlock', 'Node', 'Cron + on tick', 'BNB 3s · SOL 1s', 'Exp · max 5'],
  ['Deposits::ConfirmJob', 'Admin API', 'On deposit row insert', 'On block tick', 'Idempotent · 3'],
  [
    'Deposits::CreditJob',
    'Admin API',
    'After confirmations met',
    'Once',
    'Strict — manual review on fail',
  ],
  ['Sweep::BuildJob', 'Node', 'On batch.execute', 'Once per batch', 'Exp · max 3'],
  ['Sweep::BroadcastJob', 'Node', 'After build', 'Per tx', 'Exp · max 5'],
  ['Sweep::TrackJob', 'Node', 'After broadcast', 'Every 10s', 'Indefinite until terminal'],
  ['Multisig::SubmitJob', 'Admin API', 'On withdrawal.submit', 'Once', 'Exp · max 5'],
  ['Multisig::PollJob', 'Admin API', 'Cron', '30s', 'Indefinite'],
  ['Multisig::ExecuteJob', 'Admin API', 'When threshold met', 'Once', 'Exp · max 3'],
  ['Reconciliation::HourlyJob', 'Admin API', 'Cron', '1h', 'Alert on fail'],
  ['Audit::EmitJob', 'Admin API', 'After every action', 'Sync write', 'No retry'],
  ['Health::PingChainsJob', 'Node', 'Cron', '30s', 'No retry'],
];

export function TabJobs() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Background jobs</h3>
        <p>
          All long-running or external-IO work runs in the queue. Retry policies are tuned per job
          class — chain calls retry exponentially, ledger writes never retry (must be idempotent or
          fail loud).
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Owner</th>
              <th>Trigger</th>
              <th>Frequency</th>
              <th>Retry</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((r) => (
              <tr key={r[0]}>
                <td className="text-mono text-xs fw-500">{r[0]}</td>
                <td>
                  <span className={`badge ${r[1] === 'Node' ? 'info' : 'warn'}`}>{r[1]}</span>
                </td>
                <td className="text-sm text-muted">{r[2]}</td>
                <td className="text-sm text-mono">{r[3]}</td>
                <td className="text-xs text-muted">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
