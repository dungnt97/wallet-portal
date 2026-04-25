import { I } from '@/icons';
import { ENV_PROFILES, MULTI_ENV_ENABLED, useEnvStore } from '@/stores/env-store';
// Environment picker pill — reads multi-profile list from VITE_ENV_PROFILES.
// Selection persists in localStorage via useEnvStore. Switching environments
// causes the API client to use the new base URL immediately (no page reload).
// When VITE_ENV_PROFILES is unset, the picker is hidden (single-env mode).
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type EnvTone = 'err' | 'warn' | 'info' | 'muted';

/** Map profile name to a visual tone (first profile = production = red, etc.) */
function profileTone(index: number): EnvTone {
  const tones: EnvTone[] = ['err', 'warn', 'info', 'muted'];
  return tones[index % tones.length] ?? 'muted';
}

export function EnvPicker() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeProfileName = useEnvStore((s) => s.activeProfileName);
  const setActiveProfileName = useEnvStore((s) => s.setActiveProfileName);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Single-env mode — hide the picker entirely
  if (!MULTI_ENV_ENABLED) return null;

  const currentIndex = ENV_PROFILES.findIndex((p) => p.name === activeProfileName);
  const current = ENV_PROFILES[currentIndex] ?? ENV_PROFILES[0]!;
  const currentTone = profileTone(currentIndex === -1 ? 0 : currentIndex);

  return (
    <div className="env-picker" ref={ref}>
      <button
        type="button"
        className={`env-pill env-pill-${currentTone}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`env-dot env-dot-${currentTone}`} />
        {current.name.toUpperCase()}
        <I.ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 2 }} />
      </button>

      {open && (
        <div className="env-menu">
          <div className="env-menu-head">{t('shell.environment')}</div>
          {ENV_PROFILES.map((profile, idx) => {
            const tone = profileTone(idx);
            const isActive = profile.name === current.name;
            return (
              <button
                key={profile.name}
                type="button"
                className={`env-menu-item ${isActive ? 'current' : ''}`}
                onClick={() => {
                  setActiveProfileName(profile.name);
                  setOpen(false);
                }}
              >
                <span className={`env-dot env-dot-${tone}`} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="env-menu-label">{profile.name}</div>
                  <div className="env-menu-host">{profile.apiUrl}</div>
                </div>
                {isActive && <I.Check size={12} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
          <div className="env-menu-sep" />
          <div className="env-menu-warn">
            <I.AlertTri size={11} />
            {t('shell.envSwitchWarning')}
          </div>
        </div>
      )}
    </div>
  );
}
