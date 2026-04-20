// Pending signer-change queue — each item requires 2/3 Treasurer approvals.
import { I } from '@/icons';
import { FIXTURE_STAFF } from '@/lib/constants';
import { shortHash } from '@/lib/format';
import type { SignerChangeRequest } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  requests: SignerChangeRequest[];
  currentStaffId?: string;
  currentRole?: string;
  onSign: (c: SignerChangeRequest) => void;
}

export function SignerChangeRequests({ requests, currentStaffId, currentRole, onSign }: Props) {
  if (requests.length === 0) return null;
  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <h3 className="card-title">Pending signer changes</h3>
        <span className="text-xs text-muted">
          Each requires 2/3 Treasurer approvals · 48h time-lock before activation
        </span>
      </div>
      <div style={{ padding: 4 }}>
        {requests.map((c) => {
          const proposer = FIXTURE_STAFF.find((s) => s.id === c.proposedBy);
          const alreadySigned = currentStaffId ? c.approvers.includes(currentStaffId) : false;
          const KindIcon = c.kind === 'add' ? I.UserPlus : c.kind === 'remove' ? I.UserX : I.Key;
          const kindTone = c.kind === 'add' ? 'ok' : c.kind === 'remove' ? 'err' : 'warn';
          const canSign = currentRole === 'treasurer' || currentRole === 'admin';

          return (
            <div key={c.id} className="change-row">
              <div className={`change-kind ${kindTone}`}>
                <KindIcon size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="hstack" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="fw-600 text-sm">{c.label}</span>
                  <span className="text-xs text-muted text-mono">{c.id}</span>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: 3 }}>
                  Proposed by {proposer?.name ?? 'system'} · <LiveTimeAgo at={c.proposedAt} />
                  {c.meta?.from && c.meta.to && (
                    <>
                      {' '}
                      · <span className="text-mono">{shortHash(c.meta.from, 6, 4)}</span> →{' '}
                      <span className="text-mono">{shortHash(c.meta.to, 6, 4)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="approval-row" style={{ marginRight: 12 }}>
                {Array.from({ length: c.required }, (_, j) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: pip positions are stable
                    key={j}
                    className={`approval-pip ${j < c.collected ? 'approved' : 'pending'}`}
                  >
                    {j < c.collected && <I.Check size={9} />}
                  </div>
                ))}
                <span className="approval-text">
                  {c.collected}/{c.required}
                </span>
              </div>
              {canSign ? (
                alreadySigned ? (
                  <span className="approved-stamp">
                    <I.Check size={10} /> Signed
                  </span>
                ) : (
                  <button type="button" className="btn btn-accent btn-sm" onClick={() => onSign(c)}>
                    <I.ShieldCheck size={11} /> Sign
                  </button>
                )
              ) : (
                <span className="text-xs text-muted">
                  <I.Lock size={10} /> Treasurers only
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
