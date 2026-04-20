// Reusable page scaffold — heading + badge + placeholder skeleton table
// Used by all 12 stub pages to keep them under 30 LOC each
import { cn } from '@/lib/utils';

interface PageShellProps {
  title: string;
  badge?: string;
  badgeKind?: 'warn' | 'err' | 'info';
  columns: string[];
  rows?: number;
}

export function PageShell({ title, badge, badgeKind, columns, rows = 8 }: PageShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold text-[var(--text)]">{title}</h1>
        {badge && (
          <span
            className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full',
              badgeKind === 'err'  && 'bg-[var(--err-soft)] text-[var(--err-text)]',
              badgeKind === 'warn' && 'bg-[var(--warn-soft)] text-[var(--warn-text)]',
              badgeKind === 'info' && 'bg-[var(--info-soft)] text-[var(--info-text)]',
              !badgeKind           && 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
            )}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--bg-muted)]">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {columns.map((col, j) => (
                    <td key={col} className="px-4 py-3">
                      <div
                        className="h-3 rounded bg-[var(--bg-muted)] animate-pulse"
                        style={{ width: `${35 + ((i * 13 + j * 7) % 45)}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
