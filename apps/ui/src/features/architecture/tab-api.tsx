// Tab: API surface — REST endpoint catalogue.
// Ported from prototype ArchAPI in page_architecture.jsx.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Endpoint = [Method, string, string];

interface Group {
  group: string;
  endpoints: Endpoint[];
}

const GROUPS: Group[] = [
  {
    group: 'Deposits',
    endpoints: [
      ['GET', '/v1/deposits', 'List with filters (chain, token, status, user_id, date range)'],
      ['GET', '/v1/deposits/:id', 'Detail incl. confirmations, ledger ref'],
      ['POST', '/v1/deposits/:id/recheck', 'Force re-scan from chain (admin only)'],
    ],
  },
  {
    group: 'Sweeps',
    endpoints: [
      ['GET', '/v1/sweep/addresses', 'Sweep candidates with current balances'],
      ['GET', '/v1/sweep/batches', 'List batches'],
      ['POST', '/v1/sweep/batches', 'Create batch (address_ids[], chain) — idempotent'],
      ['POST', '/v1/sweep/batches/:id/execute', 'Sign & broadcast'],
      ['POST', '/v1/sweep/batches/:id/retry', 'Retry failed transactions'],
    ],
  },
  {
    group: 'Withdrawals',
    endpoints: [
      ['GET', '/v1/withdrawals', 'List'],
      ['POST', '/v1/withdrawals', 'Create draft (chain, token, amount, destination, memo)'],
      ['POST', '/v1/withdrawals/:id/submit', 'Submit to multisig'],
      ['POST', '/v1/withdrawals/:id/cancel', 'Cancel (only if no signatures yet)'],
    ],
  },
  {
    group: 'Multisig',
    endpoints: [
      ['GET', '/v1/multisig/operations', 'List pending ops'],
      ['GET', '/v1/multisig/operations/:id', 'Detail incl. signatures'],
      ['POST', '/v1/multisig/operations/:id/execute', 'Execute when threshold reached'],
    ],
  },
  {
    group: 'Ledger',
    endpoints: [
      ['GET', '/v1/users/:id/balance', 'Current balance per asset'],
      ['GET', '/v1/users/:id/ledger', 'Append-only history'],
      ['GET', '/v1/treasury/balance', 'Treasury totals'],
    ],
  },
  {
    group: 'Users',
    endpoints: [
      ['GET', '/v1/users', 'List'],
      ['POST', '/v1/users', 'Create (provisions addresses)'],
      ['PATCH', '/v1/users/:id', 'Update KYC, status'],
    ],
  },
  {
    group: 'Admin',
    endpoints: [
      ['GET', '/v1/audit', 'Audit log (filterable)'],
      ['GET', '/v1/admins', 'Admin users'],
      ['POST', '/v1/admins/:id/role', 'Change role'],
    ],
  },
];

const BADGE_KIND: Record<Method, string> = {
  GET: 'info',
  POST: 'ok',
  PATCH: 'warn',
  DELETE: 'err',
};

export function TabApi() {
  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>API surface (Admin API)</h3>
        <p>
          RESTful, versioned at /v1, JSON. Auth via session cookie (admin UI) or scoped service
          token. All write endpoints accept Idempotency-Key header.
        </p>
        {GROUPS.map((g) => (
          <div key={g.group} className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <h3 className="card-title">{g.group}</h3>
              <span className="text-xs text-muted">{g.endpoints.length} endpoints</span>
            </div>
            <table className="table">
              <tbody>
                {g.endpoints.map(([m, p, d]) => (
                  <tr key={p}>
                    <td style={{ width: 60 }}>
                      <span className={`badge ${BADGE_KIND[m]}`} style={{ padding: '1px 6px' }}>
                        {m}
                      </span>
                    </td>
                    <td className="text-mono text-sm" style={{ width: 320 }}>
                      {p}
                    </td>
                    <td className="text-sm text-muted">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
