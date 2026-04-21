// Audit KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
// FIXTURE_LOGIN_HISTORY removed; loginCount from real /staff/login-history API.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';

interface Props {
  /** Total audit log rows from the real API */
  total: number;
  isLoading?: boolean;
  /** Recent login count from real /staff/login-history API — null while loading */
  loginCount?: number | null;
}

export function AuditKpiStrip({ total, isLoading, loginCount }: Props) {
  return (
    <KpiStrip
      items={[
        {
          key: 'events',
          label: (
            <>
              <I.Logs size={10} />
              Events (all)
            </>
          ),
          value: isLoading ? '…' : total,
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
          key: 'chain',
          label: (
            <>
              <I.Shield size={10} />
              Chain integrity
            </>
          ),
          value: 'SHA-256',
          valueStyle: { fontSize: 13 },
          foot: (
            <span className="badge-tight ok">
              <span className="dot" />
              tamper-evident
            </span>
          ),
        },
        {
          key: 'retention',
          label: (
            <>
              <I.Database size={10} />
              Retention
            </>
          ),
          value: '7 yrs',
          valueStyle: { fontSize: 16 },
          foot: <span className="text-xs text-muted">append-only</span>,
        },
        {
          key: 'logins',
          label: (
            <>
              <I.Shield size={10} />
              Logins · session
            </>
          ),
          value: loginCount ?? '…',
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
      ]}
    />
  );
}
