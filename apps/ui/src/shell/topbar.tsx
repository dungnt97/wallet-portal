// Topbar — breadcrumb, search trigger, theme toggle, user menu
import { useTranslation } from 'react-i18next';
import { Search, Moon, Sun, Menu } from 'lucide-react';
import { useMatch } from 'react-router-dom';
import { UserMenu } from './user-menu';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useNavStore } from '@/stores/nav-store';
import { cn } from '@/lib/utils';

// Map route segments to page title i18n keys
const ROUTE_TITLE_KEYS: Record<string, string> = {
  dashboard:    'pageTitles.dashboard',
  deposits:     'pageTitles.deposits',
  sweep:        'pageTitles.sweep',
  withdrawals:  'pageTitles.withdrawals',
  cold:         'pageTitles.cold',
  multisig:     'pageTitles.multisig',
  recovery:     'pageTitles.recovery',
  users:        'pageTitles.users',
  transactions: 'pageTitles.transactions',
  recon:        'pageTitles.recon',
  audit:        'pageTitles.audit',
  signers:      'pageTitles.signers',
  notifs:       'pageTitles.notifs',
  architecture: 'pageTitles.architecture',
};

interface TopbarProps {
  onOpenCommandPalette: () => void;
}

export function Topbar({ onOpenCommandPalette }: TopbarProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTweaksStore();
  const { toggleCollapsed, toggleMobileOpen } = useNavStore();

  // Derive current page title from URL
  const match = useMatch('/app/:page/*');
  const segment = match?.params.page ?? 'dashboard';
  const titleKey = ROUTE_TITLE_KEYS[segment] ?? 'pageTitles.dashboard';
  const pageTitle = t(titleKey);

  return (
    <header className="h-11 flex items-center gap-2 px-3 border-b border-[var(--line)] bg-[var(--bg-elev)] flex-shrink-0">
      {/* Sidebar toggle */}
      <button
        className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
        onClick={() => {
          // On mobile (<720px) toggle overlay; on desktop toggle collapse
          if (window.innerWidth < 720) toggleMobileOpen();
          else toggleCollapsed();
        }}
        aria-label="Toggle sidebar"
      >
        <Menu size={15} />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="hidden sm:block text-[12px] text-[var(--text-faint)]">Treasury</span>
        <span className="hidden sm:block text-[var(--line-strong)]">/</span>
        <span className="text-[13px] font-medium text-[var(--text)] truncate">{pageTitle}</span>
      </div>

      {/* Search button */}
      <button
        className={cn(
          'flex items-center gap-2 px-2.5 py-1 rounded-md border border-[var(--line)]',
          'text-[var(--text-faint)] hover:text-[var(--text)] hover:border-[var(--line-strong)]',
          'transition-colors text-[12px]',
        )}
        onClick={onOpenCommandPalette}
        aria-label={`${t('common.search')} (⌘K)`}
      >
        <Search size={13} />
        <span className="hidden md:block">{t('topbar.searchLong')}</span>
        <span className="md:hidden">{t('common.search')}</span>
        <kbd className="hidden md:block text-[10px] px-1 py-0.5 rounded border border-[var(--line)] bg-[var(--bg-muted)]">⌘K</kbd>
      </button>

      {/* Theme toggle */}
      <button
        className="p-1.5 rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? t('topbar.darkMode') : t('topbar.lightMode')}
      >
        {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>

      {/* User menu */}
      <UserMenu />
    </header>
  );
}
