// Mobile nav overlay — scrim + slide-in sidebar for xs/sm viewports.
// Backed by `.mobile-nav-scrim` in base.css. The sidebar itself keeps
// its own styles — we render it inline here so it sits above the scrim.
import { Sidebar } from './sidebar';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <>
      <div className="mobile-nav-scrim" onClick={onClose} />
      <div className="mobile-nav-drawer">
        <Sidebar collapsed={false} onNavigate={onClose} />
      </div>
    </>
  );
}
