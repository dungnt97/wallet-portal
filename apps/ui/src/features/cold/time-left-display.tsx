// TimeLeft display component — renders a live countdown to a target date.
// Used in withdrawal sheet for 48h cold timelock countdown.
import { useTimeLeft } from '@/hooks/use-time-left';
import { useTranslation } from 'react-i18next';

interface Props {
  unlockAt: string | null | undefined;
  /** Optional: show compact single-line format */
  compact?: boolean;
}

/** Renders "Xh Ym Zs" countdown, ticking every second. Shows "Unlocked" when expired. */
export function TimeLeftDisplay({ unlockAt, compact = false }: Props) {
  const { t } = useTranslation();
  const left = useTimeLeft(unlockAt);

  if (left.expired) {
    return <span className="badge-tight ok">{t('withdrawals.timelock.unlocked')}</span>;
  }

  const parts: string[] = [];
  if (left.days > 0) parts.push(`${left.days}d`);
  if (left.hours > 0 || left.days > 0) parts.push(`${left.hours}h`);
  parts.push(`${left.minutes}m`);
  parts.push(`${left.seconds}s`);

  if (compact) {
    return (
      <span className="text-mono text-xs" style={{ color: 'var(--warn-text)' }}>
        {parts.join(' ')}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="badge-tight warn">{t('withdrawals.timelock.locked')}</span>
      <span
        className="text-mono"
        style={{ color: 'var(--warn-text)', fontVariantNumeric: 'tabular-nums' }}
      >
        {parts.join(' ')}
      </span>
      <span className="text-xs text-muted">{t('withdrawals.timelock.remaining')}</span>
    </div>
  );
}
