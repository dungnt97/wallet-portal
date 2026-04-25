// Cold balance cards — 4 cards (BNB hot, BNB cold, SOL hot, SOL cold) each with
// USDT + USDC sub-rows from real GET /cold/balances data.
// Stale flag shown as orange badge when backend reports cached data.
import type { ColdBalanceEntry } from '@/api/queries';
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTranslation } from 'react-i18next';

interface CardGroup {
  chain: 'bnb' | 'sol';
  tier: 'hot' | 'cold';
  address: string;
  entries: ColdBalanceEntry[];
  stale: boolean;
}

function groupEntries(entries: ColdBalanceEntry[]): CardGroup[] {
  const map = new Map<string, CardGroup>();
  for (const e of entries) {
    const key = `${e.chain}:${e.tier}`;
    if (!map.has(key)) {
      map.set(key, {
        chain: e.chain,
        tier: e.tier,
        address: e.address,
        entries: [],
        stale: false,
      });
    }
    const group = map.get(key)!;
    group.entries.push(e);
    if (e.stale) group.stale = true;
  }
  // Deterministic order: BNB hot, BNB cold, SOL hot, SOL cold
  const order = ['bnb:hot', 'bnb:cold', 'sol:hot', 'sol:cold'];
  return order.map((k) => map.get(k)).filter((g): g is CardGroup => g !== undefined);
}

function totalUsd(entries: ColdBalanceEntry[], chain: 'bnb' | 'sol'): number {
  const divisor = chain === 'bnb' ? 1e18 : 1e6;
  return entries.reduce((s, e) => s + Number(e.balance) / divisor, 0);
}

interface CardProps {
  group: CardGroup;
  canRebalance: boolean;
  onRebalance: (chain: 'bnb' | 'sol') => void;
}

function BalanceCard({ group, canRebalance, onRebalance }: CardProps) {
  const { t } = useTranslation();
  const isHot = group.tier === 'hot';
  const total = totalUsd(group.entries, group.chain);

  return (
    <div className="card pro-card" style={{ flex: '1 1 220px', minWidth: 200 }}>
      <div className="pro-card-header">
        <ChainPill chain={group.chain} />
        <span className="fw-600" style={{ textTransform: 'capitalize' }}>
          {group.chain === 'bnb' ? 'BNB' : 'Solana'}{' '}
          {isHot ? t('cold.tierHot') : t('cold.tierCold')}
        </span>
        <div className="spacer" />
        {group.stale && (
          <span className="badge-tight warn" title={t('cold.staleHint')}>
            <I.Clock size={9} /> {t('cold.stale')}
          </span>
        )}
      </div>

      <div style={{ padding: '8px 0' }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          ${fmtUSD(total)}
        </div>
        <div className="text-xs text-mono text-muted" style={{ marginTop: 2 }}>
          {shortHash(group.address, 8, 6)}
        </div>
      </div>

      {/* Token sub-rows */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        {group.entries.map((e) => (
          <div
            key={e.token}
            className="hstack"
            style={{ justifyContent: 'space-between', padding: '3px 0' }}
          >
            <span className="text-xs text-muted">{e.token}</span>
            <span className="text-xs text-mono fw-500">${fmtUSD(Number(e.balance) / (group.chain === 'bnb' ? 1e18 : 1e6))}</span>
          </div>
        ))}
      </div>

      {/* Rebalance button — only on hot cards for operators/admins */}
      {isHot && canRebalance && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 10, width: '100%' }}
          onClick={() => onRebalance(group.chain)}
        >
          <I.ArrowRight size={11} /> {t('rebalance.hotToCold')}
        </button>
      )}
    </div>
  );
}

interface Props {
  entries: ColdBalanceEntry[];
  canRebalance: boolean;
  onRebalance: (chain: 'bnb' | 'sol') => void;
}

export function ColdBalanceCards({ entries, canRebalance, onRebalance }: Props) {
  const groups = groupEntries(entries);

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {groups.map((g) => (
        <BalanceCard
          key={`${g.chain}:${g.tier}`}
          group={g}
          canRebalance={canRebalance}
          onRebalance={onRebalance}
        />
      ))}
    </div>
  );
}
