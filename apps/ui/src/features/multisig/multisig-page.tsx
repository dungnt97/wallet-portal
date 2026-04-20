// Multisig Queue page stub
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell';

export function MultisigPage() {
  const { t } = useTranslation();
  return (
    <PageShell
      title={t('pageTitles.multisig')}
      badge="5 pending"
      badgeKind="warn"
      columns={['Created', 'Type', 'Chain', 'Amount', 'Signers', 'Threshold', 'Status']}
    />
  );
}
