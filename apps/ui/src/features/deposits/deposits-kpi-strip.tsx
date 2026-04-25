// Deposits KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { useDashboardHistory } from '@/api/queries';
import { ChainPill, KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkline } from '../_shared/charts';
import { LiveTimeAgo } from '../_shared/realtime';
import type { FixDeposit } from './deposit-types';

interface Props {
  deposits: FixDeposit[];
}

export function DepositsKpiStrip({ deposits }: Props) {
  const { t } = useTranslation();
  const pending = deposits.filter((d) => d.status === 'pending');
  const pendingVal = pending.reduce((s, d) => s + d.amount, 0);
  const credited24h = deposits
    .filter((d) => d.status !== 'pending')
    .reduce((s, d) => s + d.amount, 0);
  const last = deposits[0];

  // Real deposit history from /dashboard/history — downsample to 24 points for sparkline
  const { data: depHistory } = useDashboardHistory('deposits', '7d');
  const depPoints = useMemo(() => {
    const pts = (depHistory?.points ?? []).map((p) => p.v);
    return pts.slice(-24);
  }, [depHistory]);

  return (
    <KpiStrip
      items={[
        {
          key: 'pending',
          label: (
            <>
              <I.Clock size={10} />
              {t('deposits.pendingValue')}
            </>
          ),
          value: `$${fmtCompact(pendingVal)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{pending.length} {t('deposits.txs')}</span>
              <Sparkline data={depPoints} width={56} height={14} stroke="var(--warn)" />
            </>
          ),
        },
        {
          key: 'credited',
          label: (
            <>
              <I.Check size={10} />
              {t('deposits.credited24h')}
            </>
          ),
          value: `$${fmtCompact(credited24h)}`,
          foot: (
            <>
              <span className="text-xs delta-up">+12.1%</span>
              <Sparkline data={depPoints} width={56} height={14} stroke="var(--ok)" />
            </>
          ),
        },
        {
          key: 'confirm',
          label: (
            <>
              <I.Lightning size={10} />
              {t('deposits.avgConfirm')}
            </>
          ),
          value: '38s',
          foot: (
            <>
              <span className="text-xs text-muted">{t('deposits.target')} &lt; 60s</span>
              <span className="badge-tight ok">
                <span className="dot" />
                {t('deposits.sla')}
              </span>
            </>
          ),
        },
        {
          key: 'last',
          label: (
            <>
              <I.Database size={10} />
              {t('deposits.lastDetected')}
            </>
          ),
          value: last ? <LiveTimeAgo at={last.detectedAt} /> : '—',
          valueStyle: { fontSize: 16 },
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{last?.userName}</span>
              {last && <ChainPill chain={last.chain} label={false} />}
            </>
          ),
        },
      ]}
    />
  );
}
