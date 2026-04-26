// drift-timeline-chart — 90-day SVG area chart of net drift per snapshot.
// Follows the raw-SVG pattern from _shared/charts.tsx (no recharts dependency).
// X-axis = snapshot date, Y-axis = |driftTotalMinor| in display USD units.
import type { ReconciliationSnapshot } from '@/api/reconciliation';
import { fmtCompact } from '@/lib/format';
import { useTranslation } from 'react-i18next';

interface Props {
  snapshots: ReconciliationSnapshot[];
  /** Chart display width in px (fills container via viewBox) */
  width?: number;
  height?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert aggregate minor-unit drift to approximate display USD (6-decimal baseline) */
function minorToDisplayUsd(minor: string | null): number {
  if (!minor) return 0;
  return Math.abs(Number(minor)) / 1e6;
}

/** Format a date as MM/DD for axis labels */
function fmtAxisDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DriftTimelineChart({ snapshots, width = 600, height = 120 }: Props) {
  const { t } = useTranslation();
  const points = snapshots
    .filter((s) => s.status === 'completed' && s.driftTotalMinor !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((s) => ({
      label: fmtAxisDate(s.createdAt),
      value: minorToDisplayUsd(s.driftTotalMinor),
    }));

  if (points.length < 2) {
    return (
      <div className="card pro-card" style={{ padding: 20, textAlign: 'center' }}>
        <p className="text-muted text-xs">{t('recon.notEnoughSnapshots')}</p>
      </div>
    );
  }

  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const padX = 8;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const step = chartW / (points.length - 1);
  const stroke = 'var(--accent)';
  const gid = 'drift-timeline-grad';

  const pts = points.map((p, i) => ({
    x: padX + i * step,
    y: padY + chartH - (p.value / maxVal) * chartH,
    label: p.label,
    value: p.value,
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${(padX + chartW).toFixed(1)},${(padY + chartH).toFixed(1)} L${padX},${(padY + chartH).toFixed(1)} Z`;

  // Show up to 8 axis labels to avoid crowding
  const labelStep = Math.max(1, Math.floor(pts.length / 8));
  const axisPts = pts.filter((_, i) => i % labelStep === 0 || i === pts.length - 1);

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <h3 className="card-title">{t('recon.driftTimeline')}</h3>
        <div className="spacer" />
        <span className="text-xs text-muted">{t('recon.driftUnit')}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 20}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: height + 20, display: 'block' }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = padY + chartH - p * chartH;
          return (
            <g key={i}>
              <line
                x1={padX}
                x2={padX + chartW}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeDasharray="2,3"
                strokeWidth="0.5"
              />
              <text x={padX - 2} y={y + 3} fontSize="7" fill="var(--text-faint)" textAnchor="end">
                ${fmtCompact(maxVal * p)}
              </text>
            </g>
          );
        })}

        {/* Gradient */}
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gid})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={stroke} opacity="0.8" />
        ))}

        {/* X-axis labels */}
        {axisPts.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height + 14}
            fontSize="7"
            fill="var(--text-faint)"
            textAnchor="middle"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
