// Audit Trail page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function AuditPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.audit')}
      columns={['Time', 'Actor', 'Role', 'Action', 'Resource', 'IP', 'Hash']}
    />
  );
}
