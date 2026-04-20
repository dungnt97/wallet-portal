// Notifications page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function NotifsPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.notifs')}
      columns={['Time', 'Channel', 'Event', 'Target', 'Delivered', 'Status']}
    />
  );
}
