// Gas monitor — 24h price curve + tiered fee recommendation.
// Real gas data fetched from GET /chain/gas-history (Redis-backed, sampled every 5 min).
// Falls back to "Gas unavailable" if wallet-engine hasn't populated Redis yet.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { useGasHistory } from './use-gas-history';

interface Props {
  chain: 'bnb' | 'sol';
}

const TIER_KEY: Record<string, string> = {
  Slow: 'sweep.tierSlow',
  Standard: 'sweep.tierStandard',
  Fast: 'sweep.tierFast',
  Priority: 'sweep.tierPriority',
};

export function GasMonitor({ chain }: Props) {
  const { t } = useTranslation();
  const { data } = useGasHistory(chain);
  const unit = chain === 'bnb' ? 'gwei' : 'SOL/sig';

  // current=null means wallet-engine hasn't sampled yet or RPC is down
  if (!data || data.current === null) {
    return (
      <div className="gas-monitor gas-monitor--unavailable">
        <div className="gas-monitor-head">
          <div className="gas-monitor-title">
            <I.Lightning size={12} /> Gas · {CHAINS[chain].name}
          </div>
          <span className="badge-tight warn">
            <span className="dot" /> unavailable
          </span>
        </div>
        <div className="gas-monitor-empty">Gas data unavailable</div>
      </div>
    );
  }

  const { points, current, avg, min, max } = data;
  const history = points.map((p) => p.price);
  const hasSparkline = history.length >= 2;

  const pctOfMax = max !== min ? ((current - min!) / (max! - min!)) * 100 : 50;
  const state: 'low' | 'normal' | 'high' =
    pctOfMax < 30 ? 'low' : pctOfMax < 65 ? 'normal' : 'high';
  const stateKey =
    state === 'low'
      ? 'sweep.gasFavourable'
      : state === 'normal'
        ? 'sweep.gasNormal'
        : 'sweep.gasElevated';
  const recommendedTier = state === 'high' ? 'Fast' : 'Standard';
  const fmt = (v: number) => (chain === 'bnb' ? v.toFixed(1) : v.toFixed(6));

  // Tier prices are indicative — 0.9x / 1x / 1.2x of current real price
  const tiers =
    chain === 'bnb'
      ? [
          { name: 'Slow', gwei: current * 0.9, wait: '~2m', perTx: current * 0.9 * 0.000021 },
          { name: 'Standard', gwei: current, wait: '~30s', perTx: current * 0.000021 },
          { name: 'Fast', gwei: current * 1.2, wait: '~6s', perTx: current * 1.2 * 0.000021 },
        ]
      : [
          { name: 'Slow', gwei: current * 0.9, wait: '~400ms', perTx: current * 0.9 },
          { name: 'Standard', gwei: current, wait: '~200ms', perTx: current },
          { name: 'Priority', gwei: current * 2, wait: '~100ms', perTx: current * 2 },
        ];

  const W = 240;
  const H = 48;
  const PAD = 4;

  // SVG sparkline — only rendered when ≥2 points exist
  const sparkline = hasSparkline
    ? (() => {
        const minP = min!;
        const maxP = max!;
        const xStep = (W - PAD * 2) / (history.length - 1);
        const yFor = (v: number) =>
          H - PAD - ((v - minP) / Math.max(1e-9, maxP - minP)) * (H - PAD * 2);
        const pts = history.map((v, i) => `${PAD + i * xStep},${yFor(v)}`).join(' ');
        const areaPath = `M ${PAD},${H} L ${history
          .map((v, i) => `${PAD + i * xStep},${yFor(v)}`)
          .join(' L ')} L ${W - PAD},${H} Z`;
        const dotX = PAD + (history.length - 1) * xStep;
        const dotY = yFor(current);
        const avgY = yFor(avg!);
        const strokeColor = state === 'high' ? 'var(--warn)' : 'var(--accent)';

        return (
          <div className="gas-spark">
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
              <defs>
                <linearGradient id={`gas-grad-${chain}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#gas-grad-${chain})`} />
              <polyline points={pts} fill="none" stroke={strokeColor} strokeWidth="1.3" />
              <circle cx={dotX} cy={dotY} r="2.5" fill={strokeColor} />
              <line
                x1={PAD}
                y1={avgY}
                x2={W - PAD}
                y2={avgY}
                stroke="var(--text-muted)"
                strokeDasharray="2 3"
                strokeWidth="0.8"
                opacity="0.5"
              />
            </svg>
            <div className="gas-spark-label">{t('sweep.gasSparkLabel')}</div>
          </div>
        );
      })()
    : null;

  return (
    <div className="gas-monitor">
      <div className="gas-monitor-main">
        <div className="gas-monitor-head">
          <div className="gas-monitor-title">
            <I.Lightning size={12} /> Gas · {CHAINS[chain].name}
          </div>
          <span
            className={`badge-tight ${state === 'low' ? 'ok' : state === 'normal' ? 'info' : 'warn'}`}
          >
            <span className="dot" /> {t(stateKey)}
          </span>
        </div>
        <div className="gas-monitor-row">
          <div className="gas-monitor-big">
            <div className="gas-monitor-value">
              {fmt(current)} <span className="gas-monitor-unit">{unit}</span>
            </div>
            <div className="gas-monitor-meta">
              {avg !== null && (
                <span>
                  {t('sweep.gasAvg')} <span className="text-mono fw-500">{fmt(avg)}</span>
                </span>
              )}
              {min !== null && (
                <span>
                  {t('sweep.gasMin')} <span className="text-mono">{fmt(min)}</span>
                </span>
              )}
              {max !== null && (
                <span>
                  {t('sweep.gasMax')} <span className="text-mono">{fmt(max)}</span>
                </span>
              )}
            </div>
          </div>
          {sparkline}
        </div>
      </div>
      <div className="gas-monitor-tiers">
        <div className="gas-tier-disclaimer">Tier prices indicative (±20%)</div>
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`gas-tier ${tier.name === recommendedTier ? 'recommended' : ''}`}
          >
            <div className="gas-tier-head">
              <span className="gas-tier-name">{t(TIER_KEY[tier.name] ?? tier.name)}</span>
              {tier.name === recommendedTier && (
                <span className="gas-tier-badge">{t('sweep.tierRecommended')}</span>
              )}
            </div>
            <div className="gas-tier-price">
              {fmt(tier.gwei)} <span className="gas-tier-unit">{unit}</span>
            </div>
            <div className="gas-tier-meta">
              {tier.wait} ·{' '}
              {chain === 'bnb'
                ? `${tier.perTx.toFixed(5)} BNB/tx`
                : `${(tier.perTx * 1e6).toFixed(1)} μSOL/sig`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
