// Recon page policy strip — scan cadence + last pass + block tickers.
import { I } from '@/icons';
import { BlockTicker } from '../_shared/realtime';

export function ReconPolicyStrip() {
  return (
    <div className="policy-strip">
      <div className="policy-strip-item">
        <I.Database size={11} />
        <span className="text-muted">Scan:</span>
        <span className="fw-600">every 15m · cron</span>
      </div>
      <div className="policy-strip-sep" />
      <div className="policy-strip-item">
        <I.Check size={11} />
        <span className="text-muted">Last pass:</span>
        <span className="fw-600">2m ago</span>
      </div>
      <div className="spacer" />
      <BlockTicker chain="bnb" />
      <BlockTicker chain="sol" />
    </div>
  );
}
