import type { StaffMemberRow } from '@/api/queries';
import type { UserRecord } from '@/api/users';
// Users KPI strip — counts from real API data. StaffRow fixture replaced with StaffMemberRow.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { fmtCompact } from '@/lib/format';
import { useTranslation } from 'react-i18next';

interface Props {
  users: UserRecord[];
  totalUsers: number;
  /** Staff list from real /staff API — null while loading */
  staff: StaffMemberRow[] | null;
}

export function UsersKpiStrip({ users, totalUsers, staff }: Props) {
  const { t } = useTranslation();
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
              {t('users.kpiStaff')}
            </>
          ),
          value: staff?.length ?? '…',
          foot: (
            <>
              <span className="text-xs text-muted text-mono">
                {t('users.kpiActive', { count: activeStaff })}
              </span>
              <span className="badge-tight ok">
                <span className="dot" />
                {t('users.kpiMfa')}
              </span>
            </>
          ),
        },
        {
          key: 'end-users',
          label: (
            <>
              <I.Users size={10} />
              {t('users.kpiEndUsers')}
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
              {t('users.kpiActiveUsers')}
            </>
          ),
          value: `${fmtCompact(users.length)}`,
          foot: <span className="text-xs text-muted text-mono">{t('users.kpiShownOnPage')}</span>,
        },
        {
          key: 'flags',
          label: (
            <>
              <I.AlertTri size={10} />
              {t('users.kpiCompliance')}
            </>
          ),
          value: highRisk,
          foot: (
            <>
              <span className="text-xs text-muted">{t('users.kpiRiskMed')}</span>
              <span className={`badge-tight ${highRisk > 0 ? 'warn' : 'ok'}`}>
                <span className="dot" />
                {highRisk > 0 ? t('users.kpiReview') : t('users.kpiClean')}
              </span>
            </>
          ),
        },
      ]}
    />
  );
}
