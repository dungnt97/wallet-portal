// Withdrawals page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function WithdrawalsPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.withdrawals')}
      badge="3 pending"
      badgeKind="warn"
      columns={['Created', 'User', 'Chain', 'Token', 'Amount', 'To Address', 'Signatures', 'Status']}
    />
  );
}
