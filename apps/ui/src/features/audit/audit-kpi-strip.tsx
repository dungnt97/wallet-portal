// Audit KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import type { AuditEntry, LoginEvent } from '../_shared/fixtures';

interface Props {
  log: AuditEntry[];
  logins: LoginEvent[];
}

export function AuditKpiStrip({ log, logins }: Props) {
  const warn = log.filter((l) => l.severity === 'warn').length;
  const byActor = new Map<string, number>();
  for (const l of log) byActor.set(l.actor, (byActor.get(l.actor) ?? 0) + 1);
  const topActor = [...byActor.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <KpiStrip
      items={[
        {
          key: 'events',
          label: (
            <>
              <I.Logs size={10} />
              Events · 24h
            </>
          ),
          value: log.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">all actions</span>
              <span className="badge-tight ok">
                <span className="dot" />
                Logged
              </span>
            </>
          ),
        },
        {
          key: 'warn',
          label: (
            <>
              <I.AlertTri size={10} />
              Warnings
            </>
          ),
          value: warn,
          foot: (
            <>
              <span className="text-xs text-muted">severity ≥ warn</span>
              <span className={`badge-tight ${warn > 0 ? 'warn' : 'ok'}`}>
                <span className="dot" />
                {warn > 0 ? 'Review' : 'Clean'}
              </span>
            </>
          ),
        },
        {
          key: 'logins',
          label: (
            <>
              <I.Shield size={10} />
              Logins · session
            </>
          ),
          value: logins.length,
          foot: (
            <>
              <span className="text-xs text-muted">MFA enforced</span>
              <span className="badge-tight ok">
                <span className="dot" />
                2FA
              </span>
            </>
          ),
        },
        {
          key: 'top-actor',
          label: (
            <>
              <I.Users size={10} />
              Top actor
            </>
          ),
          value: topActor ? topActor[0] : '—',
          valueStyle: { fontSize: 16 },
          foot: (
            <span className="text-xs text-muted text-mono">
              {topActor ? topActor[1] : 0} events
            </span>
          ),
        },
      ]}
    />
  );
}
