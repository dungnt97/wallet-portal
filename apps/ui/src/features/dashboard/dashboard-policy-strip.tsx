// Dashboard policy strip — withdrawal policy + HSM + reconciliation cadence.
import { I } from '@/icons';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveDot, LiveTimeAgo, useRealtime } from '../_shared/realtime';

export function DashboardPolicyStrip() {
  const { t } = useTranslation();
  const rt = useRealtime();
  return (
    <div className="policy-strip">
      <div className="policy-strip-item">
        <I.Shield size={11} />
        <span className="text-muted">{t('dashboard.withdrawalPolicy')}</span>
        <span className="fw-600">{t('dashboard.treasurers', { n: 2, m: 3 })}</span>
        <span className="text-faint">· {t('dashboard.threshold')} $0</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Database size={11} />
        <span className="text-muted">{t('dashboard.hsm')}</span>
        <span className="fw-600">AWS CloudHSM</span>
        <LiveDot />
        <span className="text-muted">{t('dashboard.active')}</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Activity size={11} />
        <span className="text-muted">{t('dashboard.recon')}</span>
        <span className="fw-600">{t('dashboard.blockByBlock')}</span>
        <span className="text-faint text-mono">
          · {t('dashboard.lastRun')} <LiveTimeAgo at={new Date(rt.now - 4200).toISOString()} />
        </span>
      </div>
      <div className="spacer" />
      <BlockTicker chain="bnb" />
      <BlockTicker chain="sol" />
    </div>
  );
}
