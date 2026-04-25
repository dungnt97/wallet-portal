// Sweep KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { KpiStrip, StatusBadge } from '@/components/custody';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtCompact } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { LiveTimeAgo } from '../_shared/realtime';

interface Batch {
  id: string;
  executedAt: string | null;
  status: 'completed' | 'partial' | 'pending' | 'failed';
}

interface Props {
  chain: 'bnb' | 'sol';
  readyTotal: number;
  readyCount: number;
  selectedCount: number;
  selectedTotal: number;
  estFee: number;
  latest: Batch | undefined;
}

export function SweepKpiStrip({
  chain,
  readyTotal,
  readyCount,
  selectedCount,
  selectedTotal,
  estFee,
  latest,
}: Props) {
  const { t } = useTranslation();
  return (
    <KpiStrip
      items={[
        {
          key: 'ready',
          label: (
            <>
              <I.Sweep size={10} />
              {t('sweep.readyToSweep')}
            </>
          ),
          value: `$${fmtCompact(readyTotal)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {t('sweep.kpiAddrsShort', { n: readyCount, chain: CHAINS[chain].short })}
              </span>
              <span className="badge-tight warn">
                <span className="dot" />
                {t('sweep.pending')}
              </span>
            </>
          ),
        },
        {
          key: 'selected',
          label: (
            <>
              <I.Check size={10} />
              {t('sweep.selected')}
            </>
          ),
          value: `$${fmtCompact(selectedTotal)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {t('sweep.kpiAddrs', { n: selectedCount })}
              </span>
              <span className="text-xs delta-up">{t('sweep.kpiBatch')}</span>
            </>
          ),
        },
        {
          key: 'fee',
          label: (
            <>
              <I.Lightning size={10} />
              {t('sweep.estNetworkFee')}
            </>
          ),
          value: estFee.toFixed(chain === 'bnb' ? 4 : 6),
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {chain === 'bnb' ? 'BNB' : 'SOL'}
              </span>
              <span className="text-xs text-muted">{t('sweep.perBatch')}</span>
            </>
          ),
        },
        {
          key: 'last',
          label: (
            <>
              <I.Activity size={10} />
              {t('sweep.lastSweep')}
            </>
          ),
          value: latest?.executedAt ? <LiveTimeAgo at={latest.executedAt} /> : '—',
          valueStyle: { fontSize: 16 },
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{latest?.id}</span>
              {latest && (
                <StatusBadge status={latest.status === 'partial' ? 'failed' : 'completed'} />
              )}
            </>
          ),
        },
      ]}
    />
  );
}
