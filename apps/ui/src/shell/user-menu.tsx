import { useAuth } from '@/auth/use-auth';
import { I } from '@/icons';
import { ROLES } from '@/lib/constants';
// User menu — avatar trigger + dropdown. Ports prototype shell.jsx
// `user-menu-trigger` / `.user-menu` block.
// Keeps the three prototype sections: header, switch-account (disabled until
// multi-account lands), settings / security, sign-out.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  compact?: boolean;
  onOpenAccount?: () => void;
  onOpenSecurity?: () => void;
}

export function UserMenu({ compact, onOpenAccount, onOpenSecurity }: Props) {
  const { t } = useTranslation();
  const { staff, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!staff) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="avatar">{staff.initials}</div>
        {!compact && (
          <>
            <span className="user-menu-name">{staff.name.split(' ')[0]}</span>
            <I.ChevronDown size={11} className="text-faint" />
          </>
        )}
      </button>

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-header">
            <div className="fw-500" style={{ fontSize: 13 }}>
              {staff.name}
            </div>
            <div className="text-xs text-muted">{staff.email}</div>
            <span className={`role-pill role-${staff.role}`}>{ROLES[staff.role]?.label}</span>
          </div>

          <button
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onOpenAccount?.();
            }}
          >
            <I.Settings size={13} /> {t('topbar.settings')}
          </button>
          <button
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onOpenSecurity?.();
            }}
          >
            <I.Shield size={13} /> Security &amp; sessions
          </button>
          <div className="user-menu-divider" />
          <button
            className="user-menu-item danger"
            onClick={() => {
              logout();
              setOpen(false);
            }}
          >
            <I.LogOut size={13} /> {t('topbar.signOut')} <span className="kbd-hint">⇧⌘Q</span>
          </button>
        </div>
      )}
    </div>
  );
}
