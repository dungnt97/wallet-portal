// Withdrawals policy strip — compliance summary row under the page header.
// Extracted from `withdrawals-page.tsx` to keep the page under 200 LOC.
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveDot } from '../_shared/realtime';

export function WithdrawalsPolicyStrip() {
  const { t } = useTranslation();
  return (
    <div className="policy-strip">
      <div className="policy-strip-item">
        <I.Shield size={11} />
        <span className="text-muted">{t('withdrawals.policy')}</span>
        <span className="fw-600">
          {t('withdrawals.treasurers', {
            n: MULTISIG_POLICY.required,
            m: MULTISIG_POLICY.total,
          })}
        </span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Database size={11} />
        <span className="text-muted">{t('withdrawals.signer')}</span>
        <span className="fw-600">{t('withdrawals.hsmCosign')}</span>
        <LiveDot />
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Activity size={11} />
        <span className="text-muted">{t('withdrawals.broadcastQueue')}</span>
        <span className="fw-600 text-mono">{t('withdrawals.pendingCount', { n: 0 })}</span>
      </div>
      <div className="spacer" />
      <BlockTicker chain="bnb" />
      <BlockTicker chain="sol" />
    </div>
  );
}
