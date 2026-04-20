// Sweep page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function SweepPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.sweep')}
      badge="12 pending"
      columns={['Created', 'Chain', 'From Address', 'Amount', 'Fee', 'Status']}
    />
  );
}
