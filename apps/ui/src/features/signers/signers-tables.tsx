// Signers tables — active / retired / change history.
import { I } from '@/icons';
import { FIXTURE_STAFF } from '@/lib/constants';
import { shortHash } from '@/lib/format';
import type { RetiredSigner, SignerChangeRequest, SignerRow } from '../_shared/fixtures';
import { minutesAgo } from '../_shared/helpers';
import { LiveTimeAgo } from '../_shared/realtime';

interface ActiveProps {
  rows: SignerRow[];
  onRotate: (s: SignerRow) => void;
  onRemove: (s: SignerRow) => void;
}

export function ActiveSignersTable({ rows, onRotate, onRemove }: ActiveProps) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Treasurer</th>
          <th>EVM key</th>
          <th>Solana key</th>
          <th>Device</th>
          <th>Last sign</th>
          <th className="num">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={t.id}>
            <td>
              <div className="hstack">
                <div className="avatar">{t.initials}</div>
                <div>
                  <div className="text-sm fw-500">{t.name}</div>
                  <div className="text-xs text-muted">{t.email}</div>
                </div>
              </div>
            </td>
            <td>
              <span className="text-mono text-xs">{shortHash(t.evmAddr, 6, 4)}</span>
              <div className="text-xs text-faint">Ledger Nano X</div>
            </td>
            <td>
              {t.solAddr ? (
                <>
                  <span className="text-mono text-xs">{shortHash(t.solAddr, 6, 4)}</span>
                  <div className="text-xs text-faint">Ledger Nano X</div>
                </>
              ) : (
                <span className="text-xs text-faint">—</span>
              )}
            </td>
            <td>
              <span className="badge-tight ok">
                <span className="dot" />
                Verified
              </span>
            </td>
            <td>
              <span className="text-xs text-muted">
                <LiveTimeAgo at={minutesAgo(60 * (i + 1) * 4)} />
              </span>
            </td>
            <td className="num">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRotate(t)}
                title="Rotate key"
              >
                <I.Key size={11} /> Rotate
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRemove(t)}
                title="Remove"
                style={{ color: 'var(--err-text)' }}
              >
                <I.UserX size={11} /> Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RetiredSignersTable({ rows }: { rows: RetiredSigner[] }) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Name</th>
          <th>Last EVM key</th>
          <th>Removed</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <div className="hstack">
                <div className="avatar" style={{ opacity: 0.6 }}>
                  {r.initials}
                </div>
                <div>
                  <div className="text-sm fw-500" style={{ opacity: 0.7 }}>
                    {r.name}
                  </div>
                  <div className="text-xs text-muted">{r.email}</div>
                </div>
              </div>
            </td>
            <td
              className="text-mono text-xs"
              style={{ textDecoration: 'line-through', opacity: 0.5 }}
            >
              {shortHash(r.evmAddr, 6, 4)}
            </td>
            <td className="text-xs text-muted">
              <LiveTimeAgo at={r.removedAt} />
            </td>
            <td className="text-xs text-muted">{r.removedReason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChangeHistoryTable({ rows }: { rows: SignerChangeRequest[] }) {
  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>Change ID</th>
          <th>Kind</th>
          <th>Subject</th>
          <th>Proposed by</th>
          <th>Signatures</th>
          <th>Executed</th>
          <th>Tx hash</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const proposer = FIXTURE_STAFF.find((s) => s.id === h.proposedBy);
          return (
            <tr key={h.id}>
              <td className="text-mono fw-500">{h.id}</td>
              <td>
                <span
                  className={`badge-tight ${h.kind === 'add' ? 'ok' : h.kind === 'remove' ? 'err' : 'warn'}`}
                >
                  {h.kind}
                </span>
              </td>
              <td className="text-sm">{h.label}</td>
              <td className="text-sm">{proposer?.name ?? 'system'}</td>
              <td className="text-xs text-mono">
                {h.collected}/{h.required}
              </td>
              <td className="text-xs text-muted">
                {h.executedAt ? <LiveTimeAgo at={h.executedAt} /> : '—'}
              </td>
              <td className="text-mono text-xs">{h.txHash ? shortHash(h.txHash, 8, 6) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
