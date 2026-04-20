// End-user detail sheet — balances + addresses + explorer links.
import { Risk } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { fmtDateTime, fmtUSD } from '@/lib/format';
import type { EnrichedUser } from '../_shared/fixtures';
import { addressExplorerUrl } from '../_shared/helpers';

interface Props {
  user: EnrichedUser | null;
  showRiskFlags: boolean;
  onClose: () => void;
}

export function UserDetailSheet({ user, showRiskFlags, onClose }: Props) {
  if (!user) return null;
  return (
    <Sheet
      open={!!user}
      onClose={onClose}
      title={user.name}
      subtitle={user.email}
      footer={
        <>
          <a
            className="btn btn-ghost"
            href={addressExplorerUrl('bnb', user.addresses.bnb)}
            target="_blank"
            rel="noreferrer"
          >
            <I.External size={13} /> BSCScan
          </a>
          <a
            className="btn btn-ghost"
            href={addressExplorerUrl('sol', user.addresses.sol)}
            target="_blank"
            rel="noreferrer"
          >
            <I.External size={13} /> Solscan
          </a>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="hstack" style={{ marginBottom: 20, gap: 14 }}>
        <div className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
          {user.initials}
        </div>
        <div>
          <div className="fw-600" style={{ fontSize: 16 }}>
            {user.name}
          </div>
          <div className="text-sm text-muted">{user.email}</div>
          <div style={{ marginTop: 6 }}>
            <span className="badge muted">{user.kycTierShort}</span>
          </div>
        </div>
      </div>

      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--text-faint)',
          margin: '8px 0 12px',
        }}
      >
        Balances
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="text-xs text-muted">USDT</div>
          <div className="text-mono fw-600" style={{ fontSize: 20, marginTop: 4 }}>
            {fmtUSD(user.balances.USDT)}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="text-xs text-muted">USDC</div>
          <div className="text-mono fw-600" style={{ fontSize: 20, marginTop: 4 }}>
            {fmtUSD(user.balances.USDC)}
          </div>
        </div>
      </div>

      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--text-faint)',
          margin: '8px 0 12px',
        }}
      >
        Addresses
      </h4>
      <dl className="dl">
        <dt>User ID</dt>
        <dd className="text-mono">{user.id}</dd>
        <dt>BNB address</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {user.addresses.bnb}
        </dd>
        <dt>Solana address</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {user.addresses.sol}
        </dd>
        <dt>Joined</dt>
        <dd>{fmtDateTime(user.createdAt)}</dd>
        {showRiskFlags && (
          <>
            <dt>Risk</dt>
            <dd>
              <Risk level={user.risk} />
            </dd>
          </>
        )}
      </dl>
    </Sheet>
  );
}
