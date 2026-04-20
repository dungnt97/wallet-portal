import { I } from '@/icons';
// Environment picker pill — Production / Staging / Sandbox / Local.
// Ports prototype shell.jsx `EnvPicker`. Selection persists in localStorage
// under `wp_env`. Switching environments is UI-only here; the actual API
// base URL is driven by build-time env vars in apps/ui.
import { useEffect, useRef, useState } from 'react';

type EnvTone = 'err' | 'warn' | 'info' | 'muted';
interface Env {
  id: string;
  label: string;
  tone: EnvTone;
  host: string;
}

const ENVS: Env[] = [
  { id: 'production', label: 'Production', tone: 'err', host: 'api.wallet.io' },
  { id: 'staging', label: 'Staging', tone: 'warn', host: 'api.staging.wallet.io' },
  { id: 'sandbox', label: 'Sandbox', tone: 'info', host: 'api.sandbox.wallet.io' },
  { id: 'local', label: 'Local', tone: 'muted', host: 'localhost:4000' },
];

export function EnvPicker() {
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<string>(() => localStorage.getItem('wp_env') ?? 'staging');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = ENVS.find((e) => e.id === env) ?? ENVS[1]!;

  return (
    <div className="env-picker" ref={ref}>
      <button className={`env-pill env-pill-${current.tone}`} onClick={() => setOpen((o) => !o)}>
        <span className={`env-dot env-dot-${current.tone}`} />
        {current.label.toUpperCase()}
        <I.ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 2 }} />
      </button>

      {open && (
        <div className="env-menu">
          <div className="env-menu-head">Environment</div>
          {ENVS.map((e) => (
            <button
              key={e.id}
              className={`env-menu-item ${env === e.id ? 'current' : ''}`}
              onClick={() => {
                setEnv(e.id);
                localStorage.setItem('wp_env', e.id);
                setOpen(false);
              }}
            >
              <span className={`env-dot env-dot-${e.tone}`} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="env-menu-label">{e.label}</div>
                <div className="env-menu-host">{e.host}</div>
              </div>
              {env === e.id && <I.Check size={12} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
          <div className="env-menu-sep" />
          <div className="env-menu-warn">
            <I.AlertTri size={11} />
            Switching environments signs you out of the current session.
          </div>
        </div>
      )}
    </div>
  );
}
