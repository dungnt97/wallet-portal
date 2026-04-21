// BandProgressBar — visual floor/ceiling band indicator for hot wallet balance.
// Shows fill bar capped at band width, with tick marks at floor/ceiling and a
// circular dot marker at the current balance position.
import { fmtUSD } from '@/lib/format';

interface Props {
  /** Current hot wallet balance in USD */
  balanceUsd: number;
  /** Band floor in USD */
  floorUsd: number;
  /** Band ceiling in USD */
  ceilingUsd: number;
}

/** Compute visual percentages based on [0, ceiling * 1.25] range so the
 *  band occupies ~80% of bar width with headroom above ceiling. */
function computePcts(balance: number, floor: number, ceiling: number) {
  const displayMax = ceiling * 1.25;
  const clamp = (v: number) => Math.max(0, Math.min(100, (v / displayMax) * 100));
  return {
    floorPct: clamp(floor),
    ceilingPct: clamp(ceiling),
    markerPct: clamp(balance),
    overCeiling: balance > ceiling,
    underFloor: balance < floor,
  };
}

export function BandProgressBar({ balanceUsd, floorUsd, ceilingUsd }: Props) {
  const { floorPct, ceilingPct, markerPct, overCeiling, underFloor } = computePcts(
    balanceUsd,
    floorUsd,
    ceilingUsd
  );

  const fillColor = overCeiling ? 'var(--warn)' : underFloor ? 'var(--err)' : 'var(--ok)';

  return (
    <div className="cold-wallet-band">
      <div className="cold-band-track">
        {/* Filled region from 0 to marker */}
        <div className="cold-band-fill" style={{ width: `${markerPct}%`, background: fillColor }} />
        {/* Floor tick */}
        <div className="cold-band-floor" style={{ left: `${floorPct}%` }} />
        {/* Ceiling tick */}
        <div className="cold-band-ceiling" style={{ left: `${ceilingPct}%` }} />
        {/* Position dot */}
        <div className="cold-band-marker" style={{ left: `${markerPct}%` }} />
      </div>
      <div className="cold-band-labels">
        <span>Floor ${fmtUSD(floorUsd)}</span>
        <span>Ceiling ${fmtUSD(ceilingUsd)}</span>
      </div>
    </div>
  );
}
