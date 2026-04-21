// Stuck-tx table — renders the list of stuck withdrawals/sweeps returned by GET /recovery/stuck.
// Each row has Bump + Cancel action buttons that respect canBump / canCancel flags from the API.
import { ChainPill } from '@/components/custody';
import { explorerUrl } from '@/features/_shared/helpers';
import { I } from '@/icons';
import { shortHash, timeAgo } from '@/lib/format';
import type { StuckTxItem } from '@wp/shared-types';
import { useTranslation } from 'react-i18next';

interface Props {
  items: StuckTxItem[];
  onBump: (item: StuckTxItem) => void;
  onCancel: (item: StuckTxItem) => void;
}

export function StuckTxTable({ items, onBump, onCancel }: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: 40, marginTop: 14, textAlign: 'center' }}>
        <I.Check
          size={28}
          style={{ color: 'var(--ok-text)', margin: '0 auto 8px', display: 'block' }}
        />
        <div className="fw-500">{t('recovery.allClear')}</div>
        <div className="text-sm text-muted">{t('recovery.allClearSub')}</div>
      </div>
    );
  }

  return (
    <div className="card pro-card" style={{ marginTop: 14 }}>
      <div className="pro-card-header">
        <h3 className="card-title">{t('recovery.needsAttention')}</h3>
        <div className="spacer" />
        <span className="text-xs text-muted text-mono">{items.length} tx</span>
      </div>
      <table className="table table-tight">
        <thead>
          <tr>
            <th>{t('recovery.colKind')}</th>
            <th>{t('recovery.colChain')}</th>
            <th>{t('recovery.colTxHash')}</th>
            <th className="num">{t('recovery.colAge')}</th>
            <th className="num">{t('recovery.colBumps')}</th>
            <th className="num">{t('recovery.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.entityType}-${item.entityId}`}>
              <td>
                <span
                  className={`badge-tight ${item.entityType === 'withdrawal' ? 'warn' : 'info'}`}
                >
                  {item.entityType}
                </span>
              </td>
              <td>
                <ChainPill chain={item.chain as 'bnb' | 'sol'} />
              </td>
              <td className="text-mono text-xs">
                <a
                  href={explorerUrl(item.chain as 'bnb' | 'sol', item.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {shortHash(item.txHash, 6, 4)}
                </a>
              </td>
              <td className="num text-xs text-muted">{timeAgo(item.broadcastAt)}</td>
              <td className="num text-xs">{item.bumpCount}</td>
              <td className="num">
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {/* Bump button — disabled when canBump=false */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onBump(item)}
                    disabled={!item.canBump}
                    title={!item.canBump ? t('recovery.bumpDisabledTip') : undefined}
                  >
                    <I.Zap size={11} /> {t('recovery.bumpBtn')}
                  </button>

                  {/* Cancel button — disabled when canCancel=false; Solana gets tooltip */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onCancel(item)}
                    disabled={!item.canCancel}
                    style={item.canCancel ? { color: 'var(--err-text)' } : undefined}
                    title={
                      !item.canCancel
                        ? item.chain === 'sol'
                          ? t('recovery.cancelSolanaDisabledTip')
                          : t('recovery.cancelDisabledTip')
                        : undefined
                    }
                  >
                    <I.X size={11} /> {t('recovery.cancelBtn')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
