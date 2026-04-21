// Ops page — kill-switch toggle + system health grid + staff sync card + backup.
// Requires ops.read permission; kill-switch/backup toggle further requires ops.killswitch.toggle.
import { useAuth } from '@/auth/use-auth';
import { PageFrame } from '@/components/custody';
import { useTranslation } from 'react-i18next';
import { BackupCard } from './backup-card';
import { HealthStatusGrid } from './health-status-grid';
import { KillSwitchCard } from './kill-switch-card';
import { StaffSyncCard } from './staff-sync-card';
import { useOpsSocket } from './use-ops-socket';

export function OpsPage() {
  const { t } = useTranslation();
  const { hasPerm } = useAuth();

  // Subscribe to ops.killswitch.changed for real-time invalidation
  useOpsSocket();

  if (!hasPerm('ops.read')) {
    return (
      <div className="page page-dense">
        <div className="page-header">
          <h1 className="page-title">{t('ops.title')}</h1>
        </div>
        <div className="card" style={{ padding: 24, color: 'var(--c-muted)', fontSize: 13 }}>
          {t('auth.unauthorized')}
        </div>
      </div>
    );
  }

  return (
    <PageFrame
      eyebrow={
        <>
          {t('ops.eyebrow')} · <span className="env-inline">{t('ops.subEyebrow')}</span>
        </>
      }
      title={t('ops.title')}
      subtitle={t('ops.subtitle')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Kill-switch — only rendered when user has toggle permission */}
        {hasPerm('ops.killswitch.toggle') && (
          <section>
            <div
              className="text-muted"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 10,
              }}
            >
              {t('ops.killSwitch.sectionLabel')}
            </div>
            <KillSwitchCard />
          </section>
        )}

        {/* Health grid — visible to all ops.read staff */}
        <section>
          <div
            className="text-muted"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 10,
            }}
          >
            {t('ops.health.sectionLabel')}
          </div>
          <HealthStatusGrid />
        </section>

        {/* Database backups — admin-only (ops.killswitch.toggle perm reused as ops-admin) */}
        {hasPerm('ops.killswitch.toggle') && (
          <section>
            <div
              className="text-muted"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 10,
              }}
            >
              {t('ops.backup.sectionLabel')}
            </div>
            <BackupCard />
          </section>
        )}

        {/* Staff directory sync — admin-only (staff.manage perm) */}
        {hasPerm('staff.manage') && (
          <section>
            <div
              className="text-muted"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 10,
              }}
            >
              {t('ops.staffSync.sectionLabel')}
            </div>
            <StaffSyncCard />
          </section>
        )}
      </div>
    </PageFrame>
  );
}
