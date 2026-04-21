// Multisig KPI strip — uses MultisigOpDisplay (real API shape). TREASURERS fixture removed.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import type { MultisigOpDisplay } from './multisig-types';

interface Props {
  ops: MultisigOpDisplay[];
  failedCount: number;
  /** Active treasurer count from real /staff API — defaults to '…' while loading */
  treasurerCount: number | null;
  /**
   * Count of treasurers with lastLoginAt < 5 min ago.
   * null = loading; undefined = not provided (shows '…' in badge).
   */
  onlineTreasurerCount: number | null;
}

export function MultisigKpiStrip({
  ops,
  failedCount,
  treasurerCount,
  onlineTreasurerCount,
}: Props) {
  const collecting = ops.filter((o) => o.status === 'collecting');
  const ready = ops.filter((o) => o.status === 'ready');

  return (
    <KpiStrip
      items={[
        {
          key: 'collecting',
          label: (
            <>
              <I.Clock size={10} />
              Collecting
            </>
          ),
          value: collecting.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                ${fmtCompact(collecting.reduce((s, o) => s + o.amount, 0))}
              </span>
              <span className="badge-tight warn">
                <span className="dot" />
                signing
              </span>
            </>
          ),
        },
        {
          key: 'ready',
          label: (
            <>
              <I.Check size={10} />
              Ready to execute
            </>
          ),
          value: ready.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">threshold met</span>
              <span className="badge-tight ok">
                <span className="dot" />
                ready
              </span>
            </>
          ),
        },
        {
          key: 'treasurers',
          label: (
            <>
              <I.Users size={10} />
              Treasurers
            </>
          ),
          value: treasurerCount ?? '…',
          foot: (
            <>
              <span className="text-xs text-muted">
                {onlineTreasurerCount === null ? '…' : `${onlineTreasurerCount} online`}
              </span>
              <span
                className={`badge-tight ${
                  onlineTreasurerCount === null ? 'muted' : onlineTreasurerCount > 0 ? 'ok' : 'warn'
                }`}
              >
                <span className="dot" />
                {onlineTreasurerCount === null ? '…' : onlineTreasurerCount > 0 ? 'active' : 'idle'}
              </span>
            </>
          ),
        },
        {
          key: 'rejected',
          label: (
            <>
              <I.UserX size={10} />
              Rejected · 30d
            </>
          ),
          value: failedCount,
          foot: (
            <span className="text-xs text-muted">
              {failedCount === 0 ? 'no rejections' : 'review required'}
            </span>
          ),
        },
      ]}
    />
  );
}
