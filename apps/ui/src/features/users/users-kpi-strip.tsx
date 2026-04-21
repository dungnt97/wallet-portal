import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
// Users KPI strip — counts from real API data. StaffRow fixture replaced with StaffMemberRow.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';

interface Props {
  users: UserRecord[];
  totalUsers: number;
  /** Staff list from real /staff API — null while loading */
  staff: StaffMemberRow[] | null;
}

export function UsersKpiStrip({ users, totalUsers, staff }: Props) {
  const t1 = users.filter((u) => u.kycTier === 'basic').length;
  const t3 = users.filter((u) => u.kycTier === 'enhanced').length;
  const highRisk = users.filter((u) => u.riskScore >= 40).length;
  const activeStaff = (staff ?? []).filter((s) => s.status === 'active').length;

  return (
    <KpiStrip
      items={[
        {
          key: 'staff',
          label: (
            <>
              <I.Users size={10} />
              Staff accounts
            </>
          ),
          value: staff?.length ?? '…',
          foot: (
            <>
              <span className="text-xs text-muted text-mono">{activeStaff} active</span>
              <span className="badge-tight ok">
                <span className="dot" />
                MFA
              </span>
            </>
          ),
        },
        {
          key: 'end-users',
          label: (
            <>
              <I.Users size={10} />
              End users
            </>
          ),
          value: totalUsers.toLocaleString(),
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                T1·{t1} T3·{t3}
              </span>
            </>
          ),
        },
        {
          key: 'custody',
          label: (
            <>
              <I.Database size={10} />
              Active users (page)
            </>
          ),
          value: `${fmtCompact(users.length)}`,
          foot: <span className="text-xs text-muted text-mono">shown on this page</span>,
        },
        {
          key: 'flags',
          label: (
            <>
              <I.AlertTri size={10} />
              Compliance flags
            </>
          ),
          value: highRisk,
          foot: (
            <>
              <span className="text-xs text-muted">risk ≥ med</span>
              <span className={`badge-tight ${highRisk > 0 ? 'warn' : 'ok'}`}>
                <span className="dot" />
                {highRisk > 0 ? 'Review' : 'Clean'}
              </span>
            </>
          ),
        },
      ]}
    />
  );
}
