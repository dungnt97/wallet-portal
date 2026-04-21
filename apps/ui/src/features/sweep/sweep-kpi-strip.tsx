// Sweep KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { KpiStrip, StatusBadge } from '@/components/custody';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtCompact } from '@/lib/format';
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
  return (
    <KpiStrip
      items={[
        {
          key: 'ready',
          label: (
            <>
              <I.Sweep size={10} />
              Ready to sweep
            </>
          ),
          value: `$${fmtCompact(readyTotal)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {readyCount} {CHAINS[chain].short} addrs
              </span>
              <span className="badge-tight warn">
                <span className="dot" />
                pending
              </span>
            </>
          ),
        },
        {
          key: 'selected',
          label: (
            <>
              <I.Check size={10} />
              Selected
            </>
          ),
          value: `$${fmtCompact(selectedTotal)}`,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{selectedCount} addrs</span>
              <span className="text-xs delta-up">batch</span>
            </>
          ),
        },
        {
          key: 'fee',
          label: (
            <>
              <I.Lightning size={10} />
              Est. network fee
            </>
          ),
          value: estFee.toFixed(chain === 'bnb' ? 4 : 6),
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {chain === 'bnb' ? 'BNB' : 'SOL'}
              </span>
              <span className="text-xs text-muted">per batch</span>
            </>
          ),
        },
        {
          key: 'last',
          label: (
            <>
              <I.Activity size={10} />
              Last sweep
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
