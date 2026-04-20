import { ToastHost } from '@/components/overlays';
import { useTweaksStore } from '@/stores/tweaks-store';
// App layout — .app grid shell. Composes sidebar + topbar + main + overlays.
// Ports prototype app.jsx `AppShell`, wiring it into react-router-dom.
// Responsive rules mirror the prototype: xs/sm always keep the desktop
// sidebar collapsed and use a mobile overlay when toggled.
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from './command-palette';
import { MobileNav } from './mobile-nav';
import { NAV, pageTitleKey } from './nav-structure';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { TweaksPanel } from './tweaks-panel';
import { useEffectiveSidebarCollapsed, useViewportBucket } from './viewport-hooks';

export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const sidebarPref = useTweaksStore((s) => s.sidebarCollapsed);
  const toggleSidebarPref = useTweaksStore((s) => s.toggleSidebarCollapsed);

  const bucket = useViewportBucket();
  const isNarrow = bucket === 'xs' || bucket === 'sm';
  const effectiveCollapsed = useEffectiveSidebarCollapsed(bucket, sidebarPref);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  // Cmd+K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-close mobile overlay on viewport change back to desktop.
  useEffect(() => {
    if (!isNarrow && mobileNavOpen) setMobileNavOpen(false);
  }, [isNarrow, mobileNavOpen]);

  // Ported behaviour — on xs/sm the toggle opens the overlay; on md/wide it
  // toggles the persisted collapse preference.
  const onToggleSidebar = useCallback(() => {
    if (isNarrow) setMobileNavOpen((o) => !o);
    else toggleSidebarPref();
  }, [isNarrow, toggleSidebarPref]);

  // Dashboard index of current page for `data-screen-label` attr (prototype
  // exposes this for debugging overlays).
  const segment = location.pathname.split('/')[2] ?? 'dashboard';
  const idx = NAV.flatMap((g) => g.items).findIndex((i) => i.id === segment);
  const screenLabel = `${String(idx + 1).padStart(2, '0')} ${t(pageTitleKey(segment))}`;

  return (
    <ToastHost>
      <div
        className="app"
        data-sidebar={effectiveCollapsed ? 'collapsed' : 'expanded'}
        data-viewport={bucket}
        data-mobile-nav={mobileNavOpen ? 'open' : 'closed'}
        data-screen-label={screenLabel}
      >
        <Sidebar collapsed={effectiveCollapsed && !mobileNavOpen} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

        <Topbar
          viewport={bucket}
          onToggleSidebar={onToggleSidebar}
          onOpenCommandPalette={() => setCmdOpen(true)}
          onOpenTweaks={() => setTweaksOpen((o) => !o)}
        />

        <main className="main">
          <Outlet />
        </main>

        {tweaksOpen && <TweaksPanel onClose={() => setTweaksOpen(false)} />}
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </div>
    </ToastHost>
  );
}
