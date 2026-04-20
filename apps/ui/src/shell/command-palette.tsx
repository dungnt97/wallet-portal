// Command palette stub — opens on Cmd+K, lists pages for navigation
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandEntry {
  id: string;
  label: string;
  to: string;
}

const PAGES: CommandEntry[] = [
  { id: 'dashboard',    label: 'Dashboard',      to: '/app/dashboard' },
  { id: 'deposits',     label: 'Deposits',       to: '/app/deposits' },
  { id: 'sweep',        label: 'Sweep',          to: '/app/sweep' },
  { id: 'withdrawals',  label: 'Withdrawals',    to: '/app/withdrawals' },
  { id: 'cold',         label: 'Cold Storage',   to: '/app/cold' },
  { id: 'multisig',     label: 'Multisig Queue', to: '/app/multisig' },
  { id: 'recovery',     label: 'TX Errors',      to: '/app/recovery' },
  { id: 'users',        label: 'Users',          to: '/app/users' },
  { id: 'transactions', label: 'Transactions',   to: '/app/transactions' },
  { id: 'recon',        label: 'Reconciliation', to: '/app/recon' },
  { id: 'audit',        label: 'Audit Trail',    to: '/app/audit' },
  { id: 'signers',      label: 'Signers',        to: '/app/signers' },
  { id: 'notifs',       label: 'Notifications',  to: '/app/notifs' },
  { id: 'architecture', label: 'Architecture',   to: '/app/architecture' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? PAGES.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] shadow-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
          <Search size={15} className="text-[var(--text-faint)] flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
            placeholder={t('topbar.searchLong')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)]">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-[var(--text-muted)]">{t('common.empty')}</li>
          )}
          {filtered.map((entry) => (
            <li key={entry.id}>
              <button
                className={cn(
                  'w-full text-left px-4 py-2.5 text-[13px] text-[var(--text-muted)]',
                  'hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors',
                )}
                onClick={() => { navigate(entry.to); onClose(); }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
