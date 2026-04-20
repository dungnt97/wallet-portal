// TX Errors / Recovery page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function RecoveryPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.recovery')}
      badge="4 errors"
      badgeKind="err"
      columns={['Time', 'TX Hash', 'Chain', 'Error Type', 'Retries', 'Status']}
    />
  );
}
