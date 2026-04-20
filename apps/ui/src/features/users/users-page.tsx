// Users page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function UsersPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.users')}
      columns={['ID', 'Email', 'Chain Addresses', 'Balance', 'Created', 'Status']}
    />
  );
}
