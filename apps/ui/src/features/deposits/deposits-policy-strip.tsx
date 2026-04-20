// Deposits policy strip — confirmation thresholds + watcher state + HD deriv.
import { I } from '@/icons';
import { useTranslation } from 'react-i18next';
import { BlockTicker, LiveDot, useRealtime } from '../_shared/realtime';

export function DepositsPolicyStrip() {
  const { t } = useTranslation();
  const rt = useRealtime();
  return (
    <div className="policy-strip">
      <div className="policy-strip-item">
        <I.ArrowDown size={11} />
        <span className="text-muted">{t('deposits.confirmsRequired')}</span>
        <span className="fw-600">BNB 12 · SOL 32</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Activity size={11} />
        <span className="text-muted">{t('deposits.watcher')}</span>
        <LiveDot />
        <span className="fw-600">{t('deposits.online')}</span>
        <span className="text-faint text-mono">
          · {t('deposits.lag')} {rt.rpc.bnb.lagBlocks} {t('deposits.blk')}
        </span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Database size={11} />
        <span className="text-muted">{t('deposits.hdDeriv')}</span>
        <span className="fw-600">BIP-44</span>
      </div>
      <div className="spacer" />
      <BlockTicker chain="bnb" />
      <BlockTicker chain="sol" />
    </div>
  );
}
