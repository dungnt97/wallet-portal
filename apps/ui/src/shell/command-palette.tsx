import { I, type IconKey } from '@/icons';
// Command palette (⌘K) — navigate + live search across users / tx hashes / emails.
// Empty query → nav items. Non-empty query (≥2 chars) → debounced /search API.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NAV } from './nav-structure';
import { useSearch } from './use-search';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PageAction {
  id: string;
  label: string;
  iconKey: IconKey;
  kind: string;
  to: string;
}

function buildPageActions(t: (k: string) => string): PageAction[] {
  return NAV.flatMap((g) =>
    g.items.map((it) => ({
      id: `g-${it.id}`,
      label: `Go to ${t(it.labelKey)}`,
      iconKey: it.iconKey,
      kind: 'Navigate',
      to: it.to,
    }))
  );
}

const TYPE_ICON: Record<string, IconKey> = {
  user: 'Users',
  withdrawal: 'ArrowUp',
  deposit: 'ArrowDown',
  sweep: 'Refresh',
};

export function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pageActions = useMemo(() => buildPageActions(t), [t]);

  // Live search — only fires when q has ≥2 chars; 250ms debounce inside hook
  const { results: searchResults, isLoading: searching } = useSearch(q);

  // Which list to show
  const showSearch = q.trim().length >= 2;
  const navFiltered = useMemo(() => {
    if (q.trim()) {
      const needle = q.toLowerCase();
      return pageActions.filter((p) => p.label.toLowerCase().includes(needle));
    }
    return pageActions;
  }, [pageActions, q]);

  // Unified item list for keyboard navigation
  const items = useMemo(() => {
    if (showSearch) {
      return searchResults.map((r) => ({
        id: r.id,
        label: r.label,
        subtitle: r.subtitle,
        kind: r.type,
        iconKey: (TYPE_ICON[r.type] ?? 'Search') as IconKey,
        to: r.href,
      }));
    }
    return navFiltered.map((p) => ({
      id: p.id,
      label: p.label,
      subtitle: '',
      kind: p.kind,
      iconKey: p.iconKey,
      to: p.to,
    }));
  }, [showSearch, searchResults, navFiltered]);

  // Reset cursor when list changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on list change
  useEffect(() => {
    setCursor(0);
  }, [items.length, q]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else setQ('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter' && items[cursor]) {
        e.preventDefault();
        go(items[cursor]?.to);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, items, cursor]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const stopClick = (e: React.MouseEvent) => e.stopPropagation();
  const stopKey = (e: React.KeyboardEvent) => e.stopPropagation();

  const sectionLabel = showSearch
    ? searching
      ? 'Searching…'
      : `${items.length} result${items.length !== 1 ? 's' : ''}`
    : 'Navigate';

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
            placeholder={t('topbar.searchLong')}
            aria-label="Command palette search"
          />
          {searching && <span className="cmd-spinner" />}
          <kbd>ESC</kbd>
        </div>
        <div className="cmd-body" ref={listRef}>
          {items.length > 0 && <div className="cmd-section">{sectionLabel}</div>}
          {items.map((item, idx) => {
            const Icon = I[item.iconKey] ?? I.Search;
            return (
              <button
                key={item.id}
                type="button"
                data-idx={idx}
                className={`cmd-row${cursor === idx ? ' cmd-row-active' : ''}`}
                onClick={() => go(item.to)}
                onMouseEnter={() => setCursor(idx)}
              >
                <Icon size={14} />
                <span className="cmd-row-label">{item.label}</span>
                {item.subtitle && <span className="cmd-row-sub">{item.subtitle}</span>}
                <span className="cmd-kind">{item.kind}</span>
              </button>
            );
          })}
          {!searching && q.trim() && items.length === 0 && (
            <div className="cmd-empty">No results for &ldquo;{q}&rdquo;</div>
          )}
        </div>
      </div>
    </div>
  );
}
