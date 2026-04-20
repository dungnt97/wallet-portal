// Deposits page stub — placeholder table, real wiring in Phase 09
import { useTranslation } from 'react-i18next';

export function DepositsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('pageTitles.deposits')}</h1>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--text)]">All deposits</span>
          <span className="text-[11px] text-[var(--text-faint)] bg-[var(--accent-soft)] text-[var(--accent-text)] px-2 py-0.5 rounded-full">4 pending</span>
        </div>
        <PlaceholderTable columns={['Time', 'User', 'Chain', 'Token', 'Amount', 'Confirmations', 'Status']} rows={8} />
      </div>
    </div>
  );
}

function PlaceholderTable({ columns, rows }: { columns: string[]; rows: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--line)]">
            {columns.map((col) => (
              <th key={col} className="px-4 py-2 text-left font-medium text-[var(--text-muted)] whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-hover)]">
              {columns.map((col) => (
                <td key={col} className="px-4 py-2.5">
                  <div className="h-3 rounded bg-[var(--bg-muted)] animate-pulse" style={{ width: `${45 + (i * 7 + col.length * 3) % 40}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
