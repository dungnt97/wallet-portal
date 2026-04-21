// Audit KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
// Accepts real total count from API instead of fixture arrays.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { FIXTURE_LOGIN_HISTORY } from '../_shared/fixtures';

interface Props {
  /** Total audit log rows from the real API */
  total: number;
  isLoading?: boolean;
}

export function AuditKpiStrip({ total, isLoading }: Props) {
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
          value: FIXTURE_LOGIN_HISTORY.length,
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
