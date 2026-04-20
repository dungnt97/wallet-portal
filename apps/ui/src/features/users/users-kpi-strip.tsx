// Users KPI strip — thin wrapper around the shared `<KpiStrip>` primitive.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import type { EnrichedUser, StaffRow } from '../_shared/fixtures';

interface Props {
  users: EnrichedUser[];
  staff: StaffRow[];
}

export function UsersKpiStrip({ users, staff }: Props) {
  const totalUserBal = users.reduce((s, u) => s + u.balances.USDT + u.balances.USDC, 0);
  const t1 = users.filter((u) => u.kycTierShort === 'T1').length;
  const t2 = users.filter((u) => u.kycTierShort === 'T2').length;
  const t3 = users.filter((u) => u.kycTierShort === 'T3').length;
  const highRisk = users.filter((u) => u.risk === 'high' || u.risk === 'med').length;

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
          value: staff.length,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {staff.filter((s) => s.active).length} active
              </span>
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
          value: users.length.toLocaleString(),
          foot: (
            <>
              <span className="text-xs delta-up">+14 · 7d</span>
              <span className="text-xs text-muted text-mono">
                T1·{t1} T2·{t2} T3·{t3}
              </span>
            </>
          ),
        },
        {
          key: 'custody',
          label: (
            <>
              <I.Database size={10} />
              Total custody
            </>
          ),
          value: `$${fmtCompact(totalUserBal)}`,
          foot: <span className="text-xs text-muted text-mono">across {users.length} wallets</span>,
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
