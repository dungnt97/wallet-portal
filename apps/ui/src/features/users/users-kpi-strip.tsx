// Users KPI strip — staff / end users / total custody / risk-flag count.
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import type { EnrichedUser, StaffRow } from './users-fixtures';

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
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Users size={10} />
          Staff accounts
        </div>
        <div className="kpi-mini-value">{staff.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">
            {staff.filter((s) => s.active).length} active
          </span>
          <span className="badge-tight ok">
            <span className="dot" />
            MFA
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Users size={10} />
          End users
        </div>
        <div className="kpi-mini-value">{users.length.toLocaleString()}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs delta-up">+14 · 7d</span>
          <span className="text-xs text-muted text-mono">
            T1·{t1} T2·{t2} T3·{t3}
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Database size={10} />
          Total custody
        </div>
        <div className="kpi-mini-value">${fmtCompact(totalUserBal)}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">across {users.length} wallets</span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.AlertTri size={10} />
          Compliance flags
        </div>
        <div className="kpi-mini-value">{highRisk}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">risk ≥ med</span>
          <span className={`badge-tight ${highRisk > 0 ? 'warn' : 'ok'}`}>
            <span className="dot" />
            {highRisk > 0 ? 'Review' : 'Clean'}
          </span>
        </div>
      </div>
    </div>
  );
}
