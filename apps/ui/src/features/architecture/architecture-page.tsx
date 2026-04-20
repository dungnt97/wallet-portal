// Architecture page stub — system diagram placeholder
import { useTranslation } from 'react-i18next';
import { Network } from 'lucide-react';

export function ArchitecturePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-semibold text-[var(--text)]">{t('pageTitles.architecture')}</h1>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-12 flex flex-col items-center justify-center gap-4 text-center min-h-[360px]">
        <Network size={40} className="text-[var(--text-faint)]" />
        <div>
          <div className="text-[14px] font-medium text-[var(--text-muted)]">System Architecture Diagram</div>
          <div className="text-[12px] text-[var(--text-faint)] mt-1">
            Interactive service map — wired in Phase 10 observability milestone.
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {['UI :5173', 'Admin API :3001', 'Wallet Engine :3002', 'Policy Engine :3003'].map((svc) => (
            <div
              key={svc}
              className="px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] text-[11px] text-[var(--text-muted)]"
            >
              {svc}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
