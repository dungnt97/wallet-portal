// Kpi strip — the dense 4-up metric row that sits above every feature table.
// Prototype CSS owns visual rules: `.kpi-strip`, `.kpi-mini`, `.kpi-mini-label`,
// `.kpi-mini-value`, `.kpi-mini-foot`. This primitive ONLY wraps that markup so
// feature code stops copy-pasting the same 60-line block. See
// `docs/ui-components.md#kpistrip` for usage recipes.
import type { ReactNode } from 'react';

/**
 * One tile in the KPI strip. Slots are intentionally `ReactNode` so callers can
 * embed Sparkline, LiveTimeAgo, ChainPill, StatusBadge, or plain strings
 * without new props every time a new caller shows up.
 */
export interface KpiItem {
  /** Required stable key — used for React list identity. */
  key: string;
  /** Small top-left label. Usually pairs an icon with a short phrase. */
  label: ReactNode;
  /** Headline value — number, formatted string, or JSX. */
  value: ReactNode;
  /**
   * Override the inline style of the value element. Most callers leave this
   * blank; use for the rare "text-style value" case (e.g. timestamp) that
   * needs a smaller font than the default 22px.
   */
  valueStyle?: React.CSSProperties;
  /**
   * Optional footer row rendered as-is inside `.kpi-mini-foot`. Callers mix
   * `<span className="text-xs …" />`, delta pills, chain pills, sparklines.
   * Keep it a single flex row — the CSS already handles spacing.
   */
  foot?: ReactNode;
}

export interface KpiStripProps {
  /** Items rendered left-to-right. Usually 4, but any count works. */
  items: KpiItem[];
  /** Extra class on the outer `.kpi-strip` (rare; prefer leaving blank). */
  className?: string;
}

/**
 * Standard KPI row used at the top of feature pages.
 *
 * @example
 * ```tsx
 * <KpiStrip
 *   items={[
 *     { key: 'pending', label: <><I.Clock size={10}/> Pending</>, value: '$42.1K', foot: <span className="text-xs text-muted">12 txs</span> },
 *     // …3 more
 *   ]}
 * />
 * ```
 */
export function KpiStrip({ items, className }: KpiStripProps) {
  return (
    <div className={className ? `kpi-strip ${className}` : 'kpi-strip'}>
      {items.map((it) => (
        <div key={it.key} className="kpi-mini">
          <div className="kpi-mini-label">{it.label}</div>
          <div className="kpi-mini-value" style={it.valueStyle}>
            {it.value}
          </div>
          {it.foot !== undefined && <div className="kpi-mini-foot">{it.foot}</div>}
        </div>
      ))}
    </div>
  );
}
