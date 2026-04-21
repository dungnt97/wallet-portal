import { Address, ChainPill, StatusBadge, TokenPill } from '@/components/custody';
// Withdrawals table — real data via WithdrawalRow (adapted from ApiWithdrawal).
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';
import type { WithdrawalRow } from './withdrawal-types';

interface Props {
  rows: WithdrawalRow[];
  onSelect: (w: WithdrawalRow) => void;
}

export function WithdrawalsTable({ rows, onSelect }: Props) {
  const { t } = useTranslation();

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
          <th className="num">{t('withdrawals.cCreated')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8}>
              <div className="table-empty">
                <div className="table-empty-title">{t('withdrawals.emptyTitle')}</div>
                <div className="text-sm">{t('withdrawals.emptyHint')}</div>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((w) => (
            <tr key={w.id} onClick={() => onSelect(w)} style={{ cursor: 'pointer' }}>
              <td className="text-mono fw-500">{w.id.slice(0, 12)}…</td>
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
              <td className="num text-xs text-muted">
                <LiveTimeAgo at={w.createdAt} />
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
