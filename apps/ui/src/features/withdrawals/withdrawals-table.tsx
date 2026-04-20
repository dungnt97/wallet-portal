import { Address, ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
// Withdrawals table — prototype visual port with approval pips.
import { I } from '@/icons';
import { FIXTURE_STAFF, ROLES } from '@/lib/constants';
import { fmtUSD } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useTranslation } from 'react-i18next';
import type { FixWithdrawal } from '../_shared/fixtures';
import { LiveTimeAgo } from '../_shared/realtime';

interface Props {
  rows: FixWithdrawal[];
  onSelect: (w: FixWithdrawal) => void;
}

// Simple hash → stable tint for avatar initials.
function initialsTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `oklch(72% 0.09 ${h})`;
}

export function WithdrawalsTable({ rows, onSelect }: Props) {
  const { t } = useTranslation();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>{t('withdrawals.cId')}</th>
          <th>{t('withdrawals.cAsset')}</th>
          <th>{t('withdrawals.cChain')}</th>
          <th className="num">{t('withdrawals.cAmount')}</th>
          <th>{t('withdrawals.cDest')}</th>
          <th>{t('withdrawals.cApprovals')}</th>
          <th>{t('withdrawals.cStatus')}</th>
          {showRiskFlags && <th>{t('withdrawals.cRisk')}</th>}
          <th>{t('withdrawals.cRequestedBy')}</th>
          <th className="num">{t('withdrawals.cCreated')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={showRiskFlags ? 10 : 9}>
              <div className="table-empty">
                <div className="table-empty-title">{t('withdrawals.emptyTitle')}</div>
                <div className="text-sm">{t('withdrawals.emptyHint')}</div>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((w) => {
            const requester = FIXTURE_STAFF.find((s) => s.id === w.requestedBy);
            const roleLabel = requester ? ROLES[requester.role]?.label : undefined;
            return (
              <tr key={w.id} onClick={() => onSelect(w)} style={{ cursor: 'pointer' }}>
                <td className="text-mono fw-500">{w.id}</td>
                <td>
                  <TokenPill token={w.token} />
                </td>
                <td>
                  <ChainPill chain={w.chain} />
                </td>
                <td className="num text-mono fw-500">{fmtUSD(w.amount)}</td>
                <td>
                  <Address value={w.destination} chain={w.chain} />
                </td>
                <td>
                  <div className="approval-row">
                    {Array.from({ length: w.multisig.total }, (_, j) => (
                      <div
                        key={j}
                        className={`approval-pip ${j < w.multisig.collected ? 'approved' : 'pending'}`}
                      >
                        {j < w.multisig.collected ? <I.Check size={9} /> : ''}
                      </div>
                    ))}
                    <span className="approval-text">
                      {w.multisig.collected}/{w.multisig.required}
                    </span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={w.stage} />
                </td>
                {showRiskFlags && (
                  <td>
                    <Risk level={w.risk} />
                  </td>
                )}
                <td className="text-sm">
                  {requester ? (
                    <span
                      className="requester-cell"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <span
                        className="avatar-initials"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: initialsTint(requester.id),
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 600,
                          flex: 'none',
                        }}
                      >
                        {requester.initials}
                      </span>
                      <span>{requester.name}</span>
                      {roleLabel && (
                        <span className={`role-pill role-${requester.role}`}>{roleLabel}</span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={w.createdAt} />
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
