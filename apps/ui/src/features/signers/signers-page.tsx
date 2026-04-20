// Signers page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function SignersPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.signers')}
      columns={['Name', 'Role', 'EVM Address', 'SOL Address', 'Status', 'Last Active']}
    />
  );
}
