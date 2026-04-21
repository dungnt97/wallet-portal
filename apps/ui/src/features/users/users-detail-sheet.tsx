import type { KycTier } from '@/api/users';
import {
  KYC_LABELS,
  useRetryDerive,
  useUpdateKyc,
  useUserAddresses,
  useUserBalance,
  useUserDetail,
} from '@/api/users';
// End-user detail sheet — balances + addresses + KYC edit + retry-derive (Slice 8 real API).
import { Risk } from '@/components/custody';
import { DetailSheet } from '@/components/overlays';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { fmtDateTime, fmtUSD } from '@/lib/format';
import { useState } from 'react';
import { addressExplorerUrl } from '../_shared/helpers';

interface Props {
  userId: string | null;
  showRiskFlags: boolean;
  onClose: () => void;
}

export function UserDetailSheet({ userId, showRiskFlags, onClose }: Props) {
  const toast = useToast();
  const [kycEdit, setKycEdit] = useState(false);
  const [pendingKyc, setPendingKyc] = useState<KycTier>('none');

  const detailQ = useUserDetail(userId ?? '');
  const balanceQ = useUserBalance(userId ?? '');
  const addressesQ = useUserAddresses(userId ?? '');
  const updateKyc = useUpdateKyc(userId ?? '');
  const retryDerive = useRetryDerive(userId ?? '');

  if (!userId) return null;

  const user = detailQ.data?.user;
  const balance = balanceQ.data;
  const addresses = addressesQ.data?.addresses ?? [];

  const bnbAddr = addresses.find((a) => a.chain === 'bnb');
  const solAddr = addresses.find((a) => a.chain === 'sol');
  const missingAddresses = !detailQ.isLoading && addresses.length < 2;

  const handleKycSave = () => {
    updateKyc.mutate(pendingKyc, {
      onSuccess: () => {
        toast('KYC tier updated — audit entry recorded.', 'success');
        setKycEdit(false);
      },
      onError: (err) => {
        toast((err as Error).message ?? 'KYC update failed', 'error');
      },
    });
  };

  const handleRetryDerive = () => {
    retryDerive.mutate(undefined, {
      onSuccess: () => {
        toast('Addresses provisioned successfully.', 'success');
      },
      onError: (err) => {
        toast((err as Error).message ?? 'Derivation failed', 'error');
      },
    });
  };

  return (
    <DetailSheet
      open={!!userId}
      onClose={onClose}
      title={user?.email ?? '—'}
      subtitle={user ? `ID: ${user.id}` : ''}
      footer={
        <>
          {bnbAddr && (
            <a
              className="btn btn-ghost"
              href={addressExplorerUrl('bnb', bnbAddr.address)}
              target="_blank"
              rel="noreferrer"
            >
              <I.External size={13} /> BSCScan
            </a>
          )}
          {solAddr && (
            <a
              className="btn btn-ghost"
              href={addressExplorerUrl('sol', solAddr.address)}
              target="_blank"
              rel="noreferrer"
            >
              <I.External size={13} /> Solscan
            </a>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {detailQ.isLoading && (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <span className="text-muted text-sm">Loading…</span>
        </div>
      )}

      {user && (
        <>
          {/* User header */}
          <div className="hstack" style={{ marginBottom: 20, gap: 14 }}>
            <div className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
              {user.email[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <div className="fw-600" style={{ fontSize: 16 }}>
                {user.email}
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge muted">{KYC_LABELS[user.kycTier]}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 6px' }}
                  onClick={() => {
                    setPendingKyc(user.kycTier);
                    setKycEdit(true);
                  }}
                >
                  <I.Settings size={10} /> Edit KYC
                </button>
              </div>
            </div>
          </div>

          {/* KYC edit inline */}
          {kycEdit && (
            <div
              style={{
                padding: 12,
                background: 'var(--info-soft)',
                borderRadius: 8,
                marginBottom: 16,
                display: 'grid',
                gap: 10,
              }}
            >
              <label className="field">
                <span className="field-label">KYC tier</span>
                <select
                  className="input"
                  value={pendingKyc}
                  onChange={(e) => setPendingKyc(e.target.value as KycTier)}
                >
                  <option value="none">None</option>
                  <option value="basic">T1 Basic</option>
                  <option value="enhanced">T3 Enhanced</option>
                </select>
              </label>
              <div className="hstack" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={handleKycSave}
                  disabled={updateKyc.isPending || pendingKyc === user.kycTier}
                >
                  {updateKyc.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setKycEdit(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Balances */}
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
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}
          >
            <div className="card" style={{ padding: 14 }}>
              <div className="text-xs text-muted">USDT</div>
              <div className="text-mono fw-600" style={{ fontSize: 20, marginTop: 4 }}>
                {balance ? fmtUSD(Number(balance.USDT)) : '—'}
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="text-xs text-muted">USDC</div>
              <div className="text-mono fw-600" style={{ fontSize: 20, marginTop: 4 }}>
                {balance ? fmtUSD(Number(balance.USDC)) : '—'}
              </div>
            </div>
          </div>

          {/* Retry-derive banner */}
          {missingAddresses && (
            <div
              style={{
                padding: 10,
                background: 'var(--warn-soft)',
                borderRadius: 8,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <I.AlertTri size={13} />
              <span className="text-xs" style={{ color: 'var(--warn-text)', flex: 1 }}>
                Address provisioning incomplete.
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 11 }}
                onClick={handleRetryDerive}
                disabled={retryDerive.isPending}
              >
                {retryDerive.isPending ? 'Retrying…' : 'Retry derive'}
              </button>
            </div>
          )}

          {/* Addresses */}
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
              {bnbAddr ? (
                <>
                  {bnbAddr.address}
                  {bnbAddr.balance ? (
                    <span className="text-muted" style={{ marginLeft: 6 }}>
                      USDT {bnbAddr.balance.USDT ?? '—'} / USDC {bnbAddr.balance.USDC ?? '—'}
                    </span>
                  ) : (
                    <span className="text-muted" style={{ marginLeft: 6 }}>
                      — <span style={{ fontSize: 10 }}>(fetching)</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted">Not yet provisioned</span>
              )}
            </dd>
            <dt>Solana address</dt>
            <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
              {solAddr ? (
                <>
                  {solAddr.address}
                  {solAddr.balance ? (
                    <span className="text-muted" style={{ marginLeft: 6 }}>
                      USDT {solAddr.balance.USDT ?? '—'} / USDC {solAddr.balance.USDC ?? '—'}
                    </span>
                  ) : (
                    <span className="text-muted" style={{ marginLeft: 6 }}>
                      — <span style={{ fontSize: 10 }}>(fetching)</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted">Not yet provisioned</span>
              )}
            </dd>
            <dt>Joined</dt>
            <dd>{fmtDateTime(user.createdAt)}</dd>
            {showRiskFlags && (
              <>
                <dt>Risk</dt>
                <dd>
                  <Risk
                    level={user.riskScore >= 70 ? 'high' : user.riskScore >= 40 ? 'med' : 'low'}
                  />
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </DetailSheet>
  );
}
