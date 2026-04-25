import { ChainPill, StatusBadge, Tabs } from '@/components/custody';
// Multisig pending/failed ops table — uses MultisigOpDisplay (real API shape).
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';
import type { MultisigOpDisplay } from './multisig-types';

type Tab = 'pending' | 'failed';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  pendingCount: number;
  failedCount: number;
  list: MultisigOpDisplay[];
  onSelect: (o: MultisigOpDisplay) => void;
}

export function MultisigOpsTable({
  tab,
  onTabChange,
  pendingCount,
  failedCount,
  list,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <Tabs
          value={tab}
          onChange={(v) => onTabChange(v as Tab)}
          embedded
          tabs={[
            { value: 'pending', label: t('multisig.tabPending'), count: pendingCount },
            { value: 'failed', label: t('multisig.tabFailed'), count: failedCount },
          ]}
        />
        <div className="spacer" />
        <span className="text-xs text-muted text-mono">{t('multisig.opsCount', { count: list.length })}</span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>{t('multisig.colOp')}</th>
            <th>{t('multisig.colVault')}</th>
            <th className="num">{t('multisig.colAmount')}</th>
            <th>{t('multisig.colApprovals')}</th>
            <th>{t('multisig.colStatus')}</th>
            <th className="num">{t('multisig.colExpires')}</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className="table-empty">
                  <div className="table-empty-title">{t('multisig.noOps')}</div>
                  <div className="text-sm">{t('multisig.noOpsHint')}</div>
                </div>
              </td>
            </tr>
          ) : (
            list.map((op) => (
              <tr key={op.id} onClick={() => onSelect(op)} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="text-mono fw-500 text-xs">{op.id.slice(0, 12)}…</div>
                  <div className="text-xs text-muted">{op.operationType}</div>
                </td>
                <td>
                  <div className="hstack">
                    <ChainPill chain={op.chain} />
                    <span className="text-sm">{op.safeName}</span>
                  </div>
                </td>
                <td className="num text-mono fw-500">
                  {op.amount > 0 ? (
                    <>
                      {fmtUSD(op.amount)} <span className="text-faint text-xs">{op.token}</span>
                    </>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td>
                  <div className="approval-row">
                    {Array.from({ length: op.total }, (_, j) => (
                      <div
                        key={j}
                        className={`approval-pip ${j < op.collected ? 'approved' : 'pending'}`}
                      >
                        {j < op.collected ? <I.Check size={9} /> : ''}
                      </div>
                    ))}
                    <span className="approval-text">
                      {op.collected}/{op.required}
                    </span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={op.status} />
                </td>
                <td className="num text-xs text-muted">
                  <LiveTimeAgo at={op.expiresAt} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
