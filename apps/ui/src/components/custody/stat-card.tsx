// Stat card — large number with optional icon, delta, and sub-text.
// Ports prototype primitives.jsx `Stat`.
import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  value: string | number;
  currency?: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  sub?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

export function StatCard({
  label,
  value,
  currency = 'USD',
  delta,
  deltaDir,
  sub,
  icon,
  children,
}: Props) {
  const [whole, dec] = String(value).split('.');
  return (
    <div className="stat">
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">
        {whole}
        {dec && <span className="decimal">.{dec}</span>}
        {currency && <span className="currency">{currency}</span>}
      </div>
      {(delta || sub) && (
        <div className="stat-foot">
          {delta && (
            <span className={`stat-delta ${deltaDir ?? ''}`}>
              {deltaDir === 'up' ? '↑' : '↓'} {delta}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
