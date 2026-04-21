import { I, type IconKey } from '@/icons';
// Command palette (⌘K) — navigate + search. Ports prototype overlays.jsx
// `CommandPalette` using base.css classes (.cmd-palette, .cmd-search, …).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NAV } from './nav-structure';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PageAction {
  id: string;
  label: string;
  iconKey: IconKey;
  kind: 'Navigate';
  to: string;
}

function buildPageActions(t: (k: string) => string): PageAction[] {
  return NAV.flatMap((g) =>
    g.items.map((it) => ({
      id: `g-${it.id}`,
      label: `Go to ${t(it.labelKey)}`,
      iconKey: it.iconKey,
      kind: 'Navigate' as const,
      to: it.to,
    }))
  );
}

export function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const pageActions = useMemo(() => buildPageActions(t), [t]);
  const filteredPages = useMemo(() => {
    if (!q.trim()) return pageActions;
    const needle = q.toLowerCase();
    return pageActions.filter((p) => p.label.toLowerCase().includes(needle));
  }, [pageActions, q]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else setQ('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const stopClick = (e: React.MouseEvent) => e.stopPropagation();
  const stopKey = (e: React.KeyboardEvent) => e.stopPropagation();

  return (
    <div
      className="cmd-scrim"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="cmd-palette" onClick={stopClick} onKeyDown={stopKey} role="presentation">
        <div className="cmd-search">
          <I.Search size={14} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to page, search users, addresses, hashes…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmd-body">
          {filteredPages.length > 0 && <div className="cmd-section">Navigate</div>}
          {filteredPages.map((p) => {
            const Icon = I[p.iconKey];
            return (
              <button key={p.id} type="button" className="cmd-row" onClick={() => go(p.to)}>
                <Icon size={14} />
                <span>{p.label}</span>
                <span className="cmd-kind">{p.kind}</span>
              </button>
            );
          })}
          {q && filteredPages.length === 0 && (
            <div className="cmd-empty">No results for &ldquo;{q}&rdquo;</div>
          )}
        </div>
      </div>
    </div>
  );
}
