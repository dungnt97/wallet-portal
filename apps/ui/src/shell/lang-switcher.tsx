import { I } from '@/icons';
import { type Lang, useTweaksStore } from '@/stores/tweaks-store';
// Language switcher button + popover dropdown.
// 1:1 port of prototype i18n.jsx `LangSwitcher`: click opens popover
// listing English + Tiếng Việt with active checkmark; outside click closes.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LangOption {
  code: Lang;
  label: string;
  sub: string;
}

const OPTIONS: LangOption[] = [
  { code: 'en', label: 'English', sub: 'EN' },
  { code: 'vi', label: 'Tiếng Việt', sub: 'VI' },
];

export function LangSwitcher() {
  const { t } = useTranslation();
  const lang = useTweaksStore((s) => s.lang);
  const setLang = useTweaksStore((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="lang-switcher" ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title={t('topbar.language')}
        aria-label={t('topbar.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <I.Globe size={15} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {lang === 'vi' ? 'VI' : 'EN'}
        </span>
      </button>
      {open && (
        <div
          className="popover lang-popover"
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: 'var(--bg-elev)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            padding: 6,
            zIndex: 100,
          }}
        >
          {OPTIONS.map((o) => {
            const active = lang === o.code;
            return (
              <button
                key={o.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLang(o.code);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: active ? 'var(--bg-muted)' : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text)',
                  textAlign: 'left',
                  transition: 'background 80ms',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-muted)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>{o.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {o.sub}
                  {active && <span style={{ color: 'var(--accent)' }}>✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
