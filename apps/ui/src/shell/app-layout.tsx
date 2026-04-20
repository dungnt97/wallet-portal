// App layout shell — sidebar + topbar + main content area
// Responsive: sidebar overlay on xs (<720px), collapsed/expanded on desktop
import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { CommandPalette } from './command-palette';
import { useNavStore } from '@/stores/nav-store';
import { BREAKPOINTS, type ViewportBucket } from '@/lib/constants';
import { cn } from '@/lib/utils';

function useViewportBucket(): ViewportBucket {
  const [bucket, setBucket] = useState<ViewportBucket>(() => {
    const w = window.innerWidth;
    if (w < BREAKPOINTS.xs) return 'xs';
    if (w < BREAKPOINTS.sm) return 'sm';
    if (w < BREAKPOINTS.md) return 'md';
    return 'wide';
  });

  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      if (w < BREAKPOINTS.xs) setBucket('xs');
      else if (w < BREAKPOINTS.sm) setBucket('sm');
      else if (w < BREAKPOINTS.md) setBucket('md');
      else setBucket('wide');
    };
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return bucket;
}

// Register Cmd+K global shortcut
function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}

export function AppLayout() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { mobileOpen, setMobileOpen, collapsed } = useNavStore();
  const bucket = useViewportBucket();
  const isMobile = bucket === 'xs';

  const openCmd = useCallback(() => setCmdOpen(true), []);
  useCommandPaletteShortcut(openCmd);

  // Auto-close mobile overlay on resize to desktop
  useEffect(() => {
    if (!isMobile && mobileOpen) setMobileOpen(false);
  }, [isMobile, mobileOpen, setMobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]" data-viewport={bucket}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar />
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 w-56">
            <Sidebar isMobile />
          </div>
        </>
      )}

      {/* Main area */}
      <div className={cn('flex flex-col flex-1 min-w-0 overflow-hidden')}>
        <Topbar onOpenCommandPalette={openCmd} />

        <main
          className={cn(
            'flex-1 overflow-y-auto p-4',
            bucket === 'wide' && 'p-6',
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
