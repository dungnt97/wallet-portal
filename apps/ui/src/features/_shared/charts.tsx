// Sparkline + AreaChart + deterministic makeSeries — ports prototype realtime.jsx
// Uses raw SVG (no recharts) to match prototype visuals 1-for-1.

interface SparkProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = 'currentColor',
  fill = true,
  strokeWidth = 1.5,
}: SparkProps) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map(
    (v, i) => [i * step, height - ((v - min) / range) * height * 0.85 - height * 0.08] as const
  );
  const d = pts
    .map((p, i) => `${(i === 0 ? 'M' : 'L') + p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');
  const areaD = `${d} L ${width.toFixed(1)},${height} L 0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline"
      preserveAspectRatio="none"
      style={{ width, height, display: 'block' }}
    >
      {fill && <path d={areaD} fill={stroke} opacity="0.12" />}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Deterministic pseudo-random time series
export function makeSeries(seed: number, len = 40, trend = 0, volatility = 0.04): number[] {
  let x = seed || 1;
  const rand = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const out: number[] = [];
  let v = 1;
  for (let i = 0; i < len; i++) {
    v += (rand() - 0.5) * volatility + trend / len;
    out.push(v);
  }
  return out;
}

interface AreaProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  label?: string;
}

export function AreaChart({
  data,
  width = 480,
  height = 120,
  stroke = 'var(--accent)',
  label,
}: AreaProps) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map(
    (v, i) => [i * step, height - ((v - min) / range) * (height - 20) - 10] as const
  );
  const d = pts
    .map((p, i) => `${(i === 0 ? 'M' : 'L') + p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');
  const areaD = `${d} L ${width.toFixed(1)},${height} L 0,${height} Z`;
  const gridY = [0.25, 0.5, 0.75].map((p) => p * height);
  const gid = `g_${label || 'area'}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      {gridY.map((y, i) => (
        <line
          key={i}
          x1="0"
          x2={width}
          y1={y}
          y2={y}
          stroke="var(--line)"
          strokeDasharray="2,3"
          strokeWidth="0.5"
        />
      ))}
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
