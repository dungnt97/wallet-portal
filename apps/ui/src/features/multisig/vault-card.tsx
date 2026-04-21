import type { StaffMemberRow } from '@/api/queries';
// Vault card — Safe / Squads treasurer pool header for the multisig page.
// TREASURERS fixture removed — staff list passed via props from real /staff API.
import { ChainPill } from '@/components/custody';
import { fmtCompact, shortHash } from '@/lib/format';
import { LiveDot } from '../_shared/realtime';

// ── Presence helpers ──────────────────────────────────────────────────────────

type PresenceStatus = 'online' | 'away' | 'offline';

/** Derive presence from lastLoginAt timestamp.
 *  online: < 5 min, away: < 30 min, offline: otherwise or null */
function getPresence(lastLoginAt: string | null): PresenceStatus {
  if (!lastLoginAt) return 'offline';
  const ageMs = Date.now() - new Date(lastLoginAt).getTime();
  if (ageMs < 5 * 60 * 1000) return 'online';
  if (ageMs < 30 * 60 * 1000) return 'away';
  return 'offline';
}

function presenceToDotVariant(p: PresenceStatus): 'ok' | 'warn' | 'err' | undefined {
  if (p === 'online') return 'ok';
  if (p === 'away') return 'warn';
  return undefined; // muted / default grey
}

interface VaultCardProps {
  chain: 'bnb' | 'sol';
  name: string;
  address: string;
  policy: string;
  balance: number;
  pending: number;
  /** Signer avatars — subset of staff list filtered to treasurer role */
  signers: Pick<StaffMemberRow, 'id' | 'initials' | 'name'>[];
}

export function VaultCard({
  chain,
  name,
  address,
  policy,
  balance,
  pending,
  signers,
}: VaultCardProps) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          padding: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div className="hstack" style={{ marginBottom: 6 }}>
            <ChainPill chain={chain} />
            <span className="badge muted text-xs">{policy}</span>
          </div>
          <div className="fw-600" style={{ fontSize: 15 }}>
            {name}
          </div>
          <div
            className="text-xs text-faint text-mono"
            style={{ marginTop: 2, wordBreak: 'break-all' }}
          >
            {shortHash(address, 10, 8)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="text-xs text-muted">Balance</div>
          <div className="text-mono fw-600" style={{ fontSize: 18, marginTop: 2 }}>
            ${fmtCompact(balance)}
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: '1px solid var(--line)',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div className="hstack" style={{ gap: 6 }}>
          <span className="text-xs text-muted">Signers</span>
          <div className="hstack" style={{ gap: 0 }}>
            {signers.map((s, i) => (
              <div
                key={s.id}
                className="avatar"
                style={{
                  width: 22,
                  height: 22,
                  fontSize: 9,
                  marginLeft: i ? -6 : 0,
                  border: '2px solid var(--bg-elev)',
                }}
                title={s.name}
              >
                {s.initials}
              </div>
            ))}
          </div>
        </div>
        <span className={`badge ${pending > 0 ? 'warn' : 'ok'}`}>
          <span className="dot" />
          {pending} pending op{pending === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

interface TreasurerTeamCardProps {
  /** Staff members with treasurer role from real /staff API */
  treasurers: StaffMemberRow[];
  required: number;
  total: number;
}

export function TreasurerTeamCard({ treasurers, required, total }: TreasurerTeamCardProps) {
  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <h3 className="card-title">Treasurer team</h3>
        <span className="text-xs text-muted">
          {required} of {total} co-signatures required per transfer
        </span>
        <div className="spacer" />
        <span className="badge-tight ok">
          <span className="dot" />
          policy active
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          background: 'var(--line)',
        }}
      >
        {treasurers.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              background: 'var(--bg-elev)',
            }}
          >
            <div className="avatar">{t.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fw-500 text-sm truncate">{t.name}</div>
              <div className="text-xs text-muted truncate text-mono">{t.email}</div>
              <div className="text-xs text-faint" style={{ marginTop: 2 }}>
                {(() => {
                  const presence = getPresence(t.lastLoginAt ?? null);
                  return (
                    <>
                      <LiveDot variant={presenceToDotVariant(presence)} />
                      {presence}
                    </>
                  );
                })()}
              </div>
            </div>
            <span className="role-pill role-treasurer">Treasurer</span>
          </div>
        ))}
        {treasurers.length === 0 && (
          <div
            style={{ padding: 12, background: 'var(--bg-elev)', gridColumn: '1 / -1' }}
            className="text-sm text-muted"
          >
            Loading treasurer list…
          </div>
        )}
      </div>
    </div>
  );
}
