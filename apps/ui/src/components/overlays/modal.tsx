import { I } from '@/icons';
// Modal — centred dialog. Ports prototype primitives.jsx `Modal`.
// Plain CSS class approach matches the prototype exactly; features that
// need focus trapping can wrap Radix Dialog around this markup.
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export function Modal({ open, onClose, title, footer, children }: Props) {
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="sheet-header">
          <h3 className="sheet-title">{title}</h3>
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
