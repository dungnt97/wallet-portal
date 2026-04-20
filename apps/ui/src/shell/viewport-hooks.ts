import { BREAKPOINTS, type ViewportBucket } from '@/lib/constants';
// Viewport hooks — replicate prototype app.jsx buckets.
// Breakpoints: xs < 720, sm < 1100, md < 1400, wide >= 1400.
// The bucket drives topbar search width, sidebar visibility, and
// sidebar collapsed-by-default heuristics.
import { useEffect, useState } from 'react';

function currentBucket(): ViewportBucket {
  if (typeof window === 'undefined') return 'wide';
  const w = window.innerWidth;
  if (w < BREAKPOINTS.xs) return 'xs';
  if (w < BREAKPOINTS.sm) return 'sm';
  if (w < BREAKPOINTS.md) return 'md';
  return 'wide';
}

export function useViewportBucket(): ViewportBucket {
  const [bucket, setBucket] = useState<ViewportBucket>(currentBucket);
  useEffect(() => {
    const onResize = () => {
      const next = currentBucket();
      setBucket((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bucket;
}

/** Derived flag — sidebar is collapsed when user prefers collapse OR the
 *  viewport is narrow (xs/sm always collapse; mobile uses overlay). */
export function useEffectiveSidebarCollapsed(bucket: ViewportBucket, userPref: boolean): boolean {
  if (bucket === 'xs' || bucket === 'sm') return true;
  return userPref;
}
