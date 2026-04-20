// User account dropdown — avatar trigger + logout
import { useRef, useState, useEffect } from 'react';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/use-auth';
import { ROLES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { t } = useTranslation();
  const { staff, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  if (!staff) return null;

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center text-[11px] font-semibold">
          {staff.initials}
        </div>
        <span className="text-[13px] text-[var(--text)] hidden sm:block">{staff.name.split(' ')[0]}</span>
        <ChevronDown size={11} className="text-[var(--text-faint)] hidden sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full mt-1 w-52 rounded-lg border border-[var(--line)] bg-[var(--bg-elev)]',
            'shadow-lg py-1 z-50',
          )}
        >
          <div className="px-3 py-2 border-b border-[var(--line)]">
            <div className="text-[13px] font-medium text-[var(--text)]">{staff.name}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{staff.email}</div>
            <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
              {ROLES[staff.role]?.label}
            </span>
          </div>

          <button
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
            onClick={() => setOpen(false)}
          >
            <Settings size={13} />
            {t('topbar.settings')}
          </button>

          <div className="h-px bg-[var(--line)] my-1" />

          <button
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--err-text)] hover:bg-[var(--err-soft)] transition-colors"
            onClick={() => { logout(); setOpen(false); }}
          >
            <LogOut size={13} />
            {t('topbar.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
