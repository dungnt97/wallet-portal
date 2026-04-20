import { I } from '@/icons';
// Sheet — right-edge slide-in panel. Ports prototype primitives.jsx `Sheet`.
// Uses raw CSS classes (.scrim, .sheet, .sheet-header, …) from base.css
// instead of Radix to preserve prototype visual fidelity pixel-for-pixel.
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}

export function Sheet({ open, onClose, title, subtitle, footer, wide, children }: Props) {
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet ${wide ? 'wide' : ''}`}>
        <div className="sheet-header">
          <div>
            <h3 className="sheet-title">{title}</h3>
            {subtitle && <div className="sheet-subtitle">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <I.X />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </>
  );
}
