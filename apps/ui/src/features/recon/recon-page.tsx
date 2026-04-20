// Reconciliation page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function ReconPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.recon')}
      columns={['Period', 'Chain', 'Token', 'On-chain Balance', 'Ledger Balance', 'Delta', 'Status']}
    />
  );
}
