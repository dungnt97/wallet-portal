// Audit KPI strip — events / warnings / logins / top-actor tiles.
import { I } from '@/icons';
import type { AuditEntry, LoginEvent } from './audit-fixtures';

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
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Logs size={10} />
          Events · 24h
        </div>
        <div className="kpi-mini-value">{log.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">all actions</span>
          <span className="badge-tight ok">
            <span className="dot" />
            Logged
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.AlertTri size={10} />
          Warnings
        </div>
        <div className="kpi-mini-value">{warn}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">severity ≥ warn</span>
          <span className={`badge-tight ${warn > 0 ? 'warn' : 'ok'}`}>
            <span className="dot" />
            {warn > 0 ? 'Review' : 'Clean'}
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Shield size={10} />
          Logins · session
        </div>
        <div className="kpi-mini-value">{logins.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">MFA enforced</span>
          <span className="badge-tight ok">
            <span className="dot" />
            2FA
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Users size={10} />
          Top actor
        </div>
        <div className="kpi-mini-value" style={{ fontSize: 16 }}>
          {topActor ? topActor[0] : '—'}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">{topActor ? topActor[1] : 0} events</span>
        </div>
      </div>
    </div>
  );
}
