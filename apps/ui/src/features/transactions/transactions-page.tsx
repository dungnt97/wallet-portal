// Transactions page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function TransactionsPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.transactions')}
      columns={['Time', 'TX Hash', 'Chain', 'Type', 'Token', 'Amount', 'Confirmations', 'Status']}
    />
  );
}
