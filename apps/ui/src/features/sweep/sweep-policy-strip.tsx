// Sweep policy strip — policy / gas top-up / idempotency row.
import { I } from '@/icons';
import { useTranslation } from 'react-i18next';
import { BlockTicker } from '../_shared/realtime';

export function SweepPolicyStrip() {
  const { t } = useTranslation();
  return (
    <div className="policy-strip">
      <div className="policy-strip-item">
        <I.Sweep size={11} />
        <span className="text-muted">{t('sweep.policyLabel')}</span>
        <span className="fw-600">{t('sweep.policyValue')}</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Lightning size={11} />
        <span className="text-muted">{t('sweep.gasTopupLabel')}</span>
        <span className="fw-600">{t('sweep.gasTopupValue')}</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Database size={11} />
        <span className="text-muted">{t('sweep.idempotencyLabel')}</span>
        <span className="fw-600">{t('sweep.idempotencyValue')}</span>
      </div>
      <div className="spacer" />
      <BlockTicker chain="bnb" />
      <BlockTicker chain="sol" />
    </div>
  );
}
