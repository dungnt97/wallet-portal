import { Address, type Column, DataTable, Filter } from '@/components/custody';
// Sweep address table + cart — selectable rows, per-chain filter.
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import type { FixSweepAddr } from './sweep-types';

interface Props {
  rows: FixSweepAddr[];
  chain: 'bnb' | 'sol';
  selected: string[];
  onToggle: (id: string | number) => void;
  onToggleAll: (next: boolean) => void;
  selectAboveThreshold: () => void;
}

export function SweepAddressTable({
  rows,
  chain,
  selected,
  onToggle,
  onToggleAll,
  selectAboveThreshold,
}: Props) {
  const { t } = useTranslation();

  const columns: Column<FixSweepAddr>[] = [
    {
      label: t('sweep.cUser'),
      render: (r) => (
        <div className="hstack">
          <div className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
            {r.userName
              .split(' ')
              .map((s) => s[0])
              .join('')}
          </div>
          <div className="text-sm fw-500">{r.userName}</div>
        </div>
      ),
    },
    { label: t('sweep.cAddress'), render: (r) => <Address value={r.address} chain={r.chain} /> },
    {
      label: 'USDT',
      num: true,
      render: (r) => <span className="text-mono">{fmtUSD(r.balanceUSDT)}</span>,
    },
    {
      label: 'USDC',
      num: true,
      render: (r) => <span className="text-mono">{fmtUSD(r.balanceUSDC)}</span>,
    },
    {
      label: t('sweep.cTotal'),
      num: true,
      render: (r) => (
        <span className="text-mono fw-600">${fmtUSD(r.balanceUSDT + r.balanceUSDC)}</span>
      ),
    },
    {
      label: chain === 'bnb' ? t('sweep.cGasBnb') : t('sweep.cGasSol'),
      num: true,
      render: (r) => {
        const low = r.gasBalance < (r.chain === 'bnb' ? 0.005 : 0.01);
        return (
          <span
            className="text-mono text-xs"
            style={{ color: low ? 'var(--err-text)' : 'var(--text-muted)' }}
          >
            {r.gasBalance.toFixed(4)}
          </span>
        );
      },
    },
    {
      label: t('sweep.cLastDeposit'),
      render: (r) => {
        if (!r.lastDepositAt) return <span className="text-xs text-muted">—</span>;
        const mins = Math.max(1, Math.floor((Date.now() - +new Date(r.lastDepositAt)) / 60_000));
        return <span className="text-xs text-muted">{mins}m ago</span>;
      },
    },
  ];

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <span className="text-sm fw-500">
          {t('sweep.addressesWithBalance', { n: rows.length })}
        </span>
        <Filter label={t('sweep.fMinBalance')} value="500" />
        <Filter label={t('sweep.fLastDeposit')} />
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={selectAboveThreshold}>
          {t('sweep.selectAboveThreshold')}
        </button>
      </div>

      <DataTable
        selectable
        selectedIds={selected}
        getRowId={(r) => r.id}
        onToggleSelect={onToggle}
        onToggleAll={onToggleAll}
        columns={columns}
        rows={rows}
      />
    </div>
  );
}

interface CartProps {
  selected: FixSweepAddr[];
  totalUSDT: number;
  totalUSDC: number;
  total: number;
  estFee: number;
  chain: 'bnb' | 'sol';
  onExecute: () => void;
}

export function SweepCart({
  selected,
  totalUSDT,
  totalUSDC,
  total,
  estFee,
  chain,
  onExecute,
}: CartProps) {
  const { t } = useTranslation();
  return (
    <div className="sweep-cart">
      <div className="sweep-cart-header">
        <h3 className="card-title">{t('sweep.cartTitle')}</h3>
        <span className="badge accent">{t('sweep.cartSelected', { n: selected.length })}</span>
      </div>
      {selected.length === 0 ? (
        <div className="sweep-cart-empty">
          <I.Sweep size={24} style={{ opacity: 0.3, margin: '0 auto 8px', display: 'block' }} />
          {t('sweep.cartEmpty')}
        </div>
      ) : (
        <div className="sweep-cart-body">
          {selected.slice(0, 6).map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--line)',
                fontSize: 12,
              }}
            >
              <span className="text-mono text-xs">{shortHash(a.address, 5, 4)}</span>
              <span className="text-mono fw-500">${fmtUSD(a.balanceUSDT + a.balanceUSDC)}</span>
            </div>
          ))}
          {selected.length > 6 && (
            <div className="text-xs text-muted" style={{ padding: '6px 0' }}>
              {t('sweep.cartMore', { n: selected.length - 6 })}
            </div>
          )}
        </div>
      )}
      <div className="sweep-cart-summary">
        <div className="sweep-cart-row">
          <span>{t('sweep.cartUsdtSub')}</span>
          <span className="text-mono">${fmtUSD(totalUSDT)}</span>
        </div>
        <div className="sweep-cart-row">
          <span>{t('sweep.cartUsdcSub')}</span>
          <span className="text-mono">${fmtUSD(totalUSDC)}</span>
        </div>
        <div className="sweep-cart-row">
          <span>{t('sweep.cartFee')}</span>
          <span className="text-mono">
            {estFee.toFixed(chain === 'bnb' ? 4 : 6)} {chain === 'bnb' ? 'BNB' : 'SOL'}
          </span>
        </div>
        <div className="sweep-cart-row total">
          <span>{t('sweep.cartTotal')}</span>
          <span className="text-mono">${fmtUSD(total)}</span>
        </div>
      </div>
      <div className="sweep-cart-footer">
        <button
          className="btn btn-accent"
          style={{ width: '100%' }}
          disabled={selected.length === 0}
          onClick={onExecute}
        >
          <I.Sweep size={13} /> {t('sweep.reviewExecute')}
        </button>
      </div>
    </div>
  );
}
