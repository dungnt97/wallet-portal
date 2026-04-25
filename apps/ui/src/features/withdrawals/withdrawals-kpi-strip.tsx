// Withdrawals KPI strip — derived from real WithdrawalRow list.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import type { WithdrawalRow } from './withdrawal-types';

interface Props {
  list: WithdrawalRow[];
}

export function WithdrawalsKpiStrip({ list }: Props) {
  const { t } = useTranslation();
  const awaiting = list.filter((w) => w.stage === 'awaiting_signatures');
  const completed = list.filter((w) => w.stage === 'completed');
  const failed = list.filter((w) => w.stage === 'failed' || w.stage === 'cancelled');

  return (
    <KpiStrip
      items={[
        {
          key: 'awaiting',
          label: (
            <>
              <I.Clock size={10} />
              {t('withdrawals.kpiAwaiting')}
            </>
          ),
          value: `$${fmtCompact(awaiting.reduce((s, w) => s + w.amount, 0))}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {t('withdrawals.kpiRequests', { n: awaiting.length })}
              </span>
              <span className="badge-tight warn">
                <span className="dot" />
                {t('withdrawals.kpiPending')}
              </span>
            </>
          ),
        },
        {
          key: 'completed',
          label: (
            <>
              <I.Check size={10} />
              {t('withdrawals.kpiCompleted')}
            </>
          ),
          value: `$${fmtCompact(completed.reduce((s, w) => s + w.amount, 0))}`,
          foot: (
            <span className="text-xs text-muted text-mono">
              {t('withdrawals.kpiSent', { n: completed.length })}
            </span>
          ),
        },
        {
          key: 'turnaround',
          label: (
            <>
              <I.Lightning size={10} />
              {t('withdrawals.kpiAvgTurnaround')}
            </>
          ),
          value: '—',
          foot: <span className="text-xs text-muted">{t('withdrawals.kpiTarget2h')}</span>,
        },
        {
          key: 'failed',
          label: (
            <>
              <I.UserX size={10} />
              {t('withdrawals.kpiFailedCancelled')}
            </>
          ),
          value: failed.length,
          foot: (
            <span className="badge-tight err">
              <span className="dot" />
              {t('withdrawals.kpiReview')}
            </span>
          ),
        },
      ]}
    />
  );
}
