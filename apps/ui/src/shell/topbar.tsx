import { NotificationsPanel } from '@/components/overlays';
import { I } from '@/icons';
import type { ViewportBucket } from '@/lib/constants';
import { useTweaksStore } from '@/stores/tweaks-store';
// Topbar — sidebar toggle + breadcrumb + search button + utility actions.
// Ports prototype shell.jsx `TopBar`. Uses prototype `.topbar`, `.icon-btn`,
// `.topbar-search` classes verbatim from base.css.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch } from 'react-router-dom';
import { EnvPicker } from './env-picker';
import { LangSwitcher } from './lang-switcher';
import { pageTitleKey } from './nav-structure';
import { UserMenu } from './user-menu';
import { WalletWidget } from './wallet-widget';

interface Props {
  viewport: ViewportBucket;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onOpenTweaks: () => void;
  onOpenAccount?: () => void;
  onOpenSecurity?: () => void;
}

export function Topbar({
  viewport,
  onToggleSidebar,
  onOpenCommandPalette,
  onOpenTweaks,
  onOpenAccount,
  onOpenSecurity,
}: Props) {
  const { t } = useTranslation();
  const theme = useTweaksStore((s) => s.theme);
  const toggleTheme = useTweaksStore((s) => s.toggleTheme);

  // Derive current page title from URL (falls back to dashboard).
  const match = useMatch('/app/:page/*');
  const segment = match?.params.page ?? 'dashboard';
  const pageTitle = t(pageTitleKey(segment));

  // Notifications dropdown — local to topbar since anchor is the bell.
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    if (notifOpen) window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [notifOpen]);

  const isNarrow = viewport === 'xs' || viewport === 'sm';
  const isXs = viewport === 'xs';

  return (
    <div className="topbar" data-viewport={viewport}>
      <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar">
        <I.Sidebar size={15} />
      </button>

      <div className="topbar-breadcrumb">
        {!isNarrow && <span>Treasury</span>}
        {!isNarrow && <I.ChevronRight size={12} className="text-faint" />}
        <span className="crumb-current">{pageTitle}</span>
      </div>

      {isXs ? (
        <button
          className="icon-btn"
          onClick={onOpenCommandPalette}
          title={`${t('common.search')} (⌘K)`}
          style={{ marginLeft: 'auto' }}
        >
          <I.Search size={15} />
        </button>
      ) : (
        <button className="topbar-search" onClick={onOpenCommandPalette}>
          <I.Search size={13} />
          {!isNarrow && <span className="topbar-search-placeholder">{t('topbar.searchLong')}</span>}
          {isNarrow && <span className="topbar-search-placeholder">{t('topbar.searchShort')}</span>}
          <kbd>⌘K</kbd>
        </button>
      )}

      <div className="topbar-actions">
        {!isNarrow && <EnvPicker />}
        <WalletWidget />

        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="icon-btn has-dot"
            title={t('topbar.notifications')}
            onClick={() => setNotifOpen((o) => !o)}
          >
            <I.Bell size={15} />
          </button>
          <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
        </div>

        {!isXs && (
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? t('topbar.darkMode') : t('topbar.lightMode')}
          >
            {theme === 'light' ? <I.Moon size={15} /> : <I.Sun size={15} />}
          </button>
        )}
        {!isXs && <LangSwitcher />}
        {!isNarrow && (
          <button className="icon-btn" onClick={onOpenTweaks} title={t('topbar.tweaks')}>
            <I.Sliders size={15} />
          </button>
        )}

        <UserMenu compact={isXs} onOpenAccount={onOpenAccount} onOpenSecurity={onOpenSecurity} />
      </div>
    </div>
  );
}
