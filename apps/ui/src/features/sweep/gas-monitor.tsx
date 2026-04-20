// Gas monitor — 24h price curve + tiered fee recommendation.
// Direct port of prototype GasMonitor component.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';

const GAS_HISTORY_BNB = [
  3.1, 3.2, 3.0, 2.9, 3.3, 3.5, 3.8, 4.1, 4.3, 4.6, 5.1, 5.4, 5.2, 4.8, 4.5, 4.2, 3.9, 3.7, 3.6,
  3.4, 3.3, 3.2, 3.1, 3.0,
];
const GAS_HISTORY_SOL = [
  0.000012, 0.000013, 0.000011, 0.000011, 0.000014, 0.000018, 0.000021, 0.000024, 0.000028,
  0.000031, 0.000029, 0.000025, 0.000022, 0.000019, 0.000017, 0.000015, 0.000014, 0.000013,
  0.000012, 0.000012, 0.000011, 0.000011, 0.000012, 0.000012,
];

interface Props {
  chain: 'bnb' | 'sol';
}

export function GasMonitor({ chain }: Props) {
  const history = chain === 'bnb' ? GAS_HISTORY_BNB : GAS_HISTORY_SOL;
  const unit = chain === 'bnb' ? 'gwei' : 'SOL/sig';
  const current = history[history.length - 1] as number;
  const min24 = Math.min(...history);
  const max24 = Math.max(...history);
  const avg24 = history.reduce((a, b) => a + b, 0) / history.length;
  const pctOfMax = ((current - min24) / (max24 - min24)) * 100;
  const state: 'low' | 'normal' | 'high' =
    pctOfMax < 30 ? 'low' : pctOfMax < 65 ? 'normal' : 'high';
  const stateLabel = state === 'low' ? 'favourable' : state === 'normal' ? 'normal' : 'elevated';
  const recommendedTier = state === 'high' ? 'Fast' : 'Standard';
  const fmt = (v: number) => (chain === 'bnb' ? v.toFixed(1) : v.toFixed(6));

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
  const xStep = (W - PAD * 2) / (history.length - 1);
  const yFor = (v: number) =>
    H - PAD - ((v - min24) / Math.max(1e-9, max24 - min24)) * (H - PAD * 2);
  const pts = history.map((v, i) => `${PAD + i * xStep},${yFor(v)}`).join(' ');
  const areaPath = `M ${PAD},${H} L ${history
    .map((v, i) => `${PAD + i * xStep},${yFor(v)}`)
    .join(' L ')} L ${W - PAD},${H} Z`;

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
            <span className="dot" /> {stateLabel}
          </span>
        </div>
        <div className="gas-monitor-row">
          <div className="gas-monitor-big">
            <div className="gas-monitor-value">
              {fmt(current)} <span className="gas-monitor-unit">{unit}</span>
            </div>
            <div className="gas-monitor-meta">
              <span>
                avg <span className="text-mono fw-500">{fmt(avg24)}</span>
              </span>
              <span>
                min <span className="text-mono">{fmt(min24)}</span>
              </span>
              <span>
                max <span className="text-mono">{fmt(max24)}</span>
              </span>
            </div>
          </div>
          <div className="gas-spark">
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
              <defs>
                <linearGradient id={`gas-grad-${chain}`} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={state === 'high' ? 'var(--warn)' : 'var(--accent)'}
                    stopOpacity="0.28"
                  />
                  <stop
                    offset="100%"
                    stopColor={state === 'high' ? 'var(--warn)' : 'var(--accent)'}
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#gas-grad-${chain})`} />
              <polyline
                points={pts}
                fill="none"
                stroke={state === 'high' ? 'var(--warn)' : 'var(--accent)'}
                strokeWidth="1.3"
              />
              <circle
                cx={PAD + (history.length - 1) * xStep}
                cy={yFor(current)}
                r="2.5"
                fill={state === 'high' ? 'var(--warn)' : 'var(--accent)'}
              />
              <line
                x1={PAD}
                y1={yFor(avg24)}
                x2={W - PAD}
                y2={yFor(avg24)}
                stroke="var(--text-muted)"
                strokeDasharray="2 3"
                strokeWidth="0.8"
                opacity="0.5"
              />
            </svg>
            <div className="gas-spark-label">24h</div>
          </div>
        </div>
      </div>
      <div className="gas-monitor-tiers">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`gas-tier ${tier.name === recommendedTier ? 'recommended' : ''}`}
          >
            <div className="gas-tier-head">
              <span className="gas-tier-name">{tier.name}</span>
              {tier.name === recommendedTier && <span className="gas-tier-badge">recommended</span>}
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
