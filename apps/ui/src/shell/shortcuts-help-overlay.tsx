// shortcuts-help-overlay — full keyboard shortcut reference sheet.
// Triggered by pressing '?' anywhere outside an input.
// Renders as a centred modal-like panel with a backdrop.
import { I } from '@/icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  descKey: string;
}

const NAV_SHORTCUTS: ShortcutRow[] = [
  { keys: ['g', 'd'], descKey: 'shortcuts.dashboard' },
  { keys: ['g', 'w'], descKey: 'shortcuts.withdrawals' },
  { keys: ['g', 's'], descKey: 'shortcuts.sweep' },
  { keys: ['g', 'c'], descKey: 'shortcuts.cold' },
  { keys: ['g', 'u'], descKey: 'shortcuts.users' },
  { keys: ['g', 'a'], descKey: 'shortcuts.audit' },
  { keys: ['g', 'r'], descKey: 'shortcuts.recovery' },
  { keys: ['g', 'o'], descKey: 'shortcuts.ops' },
];

const GLOBAL_SHORTCUTS: ShortcutRow[] = [
  { keys: ['⌘', 'K'], descKey: 'shortcuts.cmdPalette' },
  { keys: ['?'], descKey: 'shortcuts.helpToggle' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 5px',
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        lineHeight: 1,
        color: 'var(--text-primary)',
        boxShadow: '0 1px 0 var(--border)',
      }}
    >
      {children}
    </kbd>
  );
}

export function ShortcutsHelpOverlay({ open, onClose }: Props) {
  const { t } = useTranslation();

  // Close on Escape or '?'
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 900,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.helpTitle')}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 901,
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          width: 360,
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '20px 24px 24px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <I.Command size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t('shortcuts.helpTitle')}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close shortcuts help"
          >
            <I.Close size={14} />
          </button>
        </div>

        {/* Navigation section */}
        <p
          className="text-xs text-muted"
          style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          {t('shortcuts.leader')}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <tbody>
            {NAV_SHORTCUTS.map(({ keys, descKey }) => (
              <tr key={descKey}>
                <td style={{ paddingBottom: 8, width: 72 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </div>
                </td>
                <td className="text-sm" style={{ paddingBottom: 8 }}>
                  {t(descKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Global shortcuts section */}
        <p
          className="text-xs text-muted"
          style={{ marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Global
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {GLOBAL_SHORTCUTS.map(({ keys, descKey }) => (
              <tr key={descKey}>
                <td style={{ paddingBottom: 8, width: 72 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </div>
                </td>
                <td className="text-sm" style={{ paddingBottom: 8 }}>
                  {t(descKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
