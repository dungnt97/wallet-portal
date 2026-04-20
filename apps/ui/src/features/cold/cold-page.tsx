// Cold Storage page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function ColdPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.cold')}
      columns={['Address', 'Chain', 'Balance', 'Last Movement', 'Policy', 'Status']}
    />
  );
}
