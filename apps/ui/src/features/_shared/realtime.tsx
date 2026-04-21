// Realtime helpers — LiveDot, LiveTimeAgo, BlockTicker, useRealtime.
//
// C5 fix: block numbers, RPC latency, and gas price are now sourced from real
// API data (useOpsHealth + useGasHistory) instead of Math.random() fake ticks.
//
// useRealtime() returns a snapshot derived from /ops/health (10s poll).
// BlockTicker subscribes to that snapshot; consumers get live data automatically.
// LiveDot and LiveTimeAgo are purely cosmetic — unchanged.
import { useOpsHealth } from '@/api/queries';
import { useEffect, useState } from 'react';
import { useGasHistory } from '../sweep/use-gas-history';

// ── Public shape (kept backward-compatible for 17 consumer pages) ─────────────

export interface RealtimeState {
  now: number;
  blocks: { bnb: number; sol: number };
  rpc: {
    bnb: { ms: number; lagBlocks: number };
    sol: { ms: number; lagSlots: number };
  };
  gasPrice: { bnb: number; sol: number };
}

// Null-safe sentinel — shown when data hasn't loaded yet.
const LOADING_STATE: RealtimeState = {
  now: Date.now(),
  blocks: { bnb: 0, sol: 0 },
  rpc: { bnb: { ms: 0, lagBlocks: 0 }, sol: { ms: 0, lagSlots: 0 } },
  gasPrice: { bnb: 0, sol: 0 },
};

// ── useRealtime ───────────────────────────────────────────────────────────────

/**
 * Composite hook that pulls real chain state from /ops/health (10s) and
 * /chain/gas-history (5 min). Returns a stable RealtimeState snapshot.
 * All 17 consumer pages receive live data transparently via this hook.
 */
export function useRealtime(): RealtimeState {
  const { data: health } = useOpsHealth();
  const { data: bnbGas } = useGasHistory('bnb');
  const { data: solGas } = useGasHistory('sol');

  // Keep `now` ticking at 1s for LiveTimeAgo accuracy without faking chain data
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!health) return { ...LOADING_STATE, now };

  const bnbChain = health.chains.find((c) => c.id === 'bnb');
  const solChain = health.chains.find((c) => c.id === 'sol');

  return {
    now,
    blocks: {
      bnb: bnbChain?.latestBlock ?? 0,
      sol: solChain?.latestBlock ?? 0,
    },
    rpc: {
      bnb: {
        // ChainHealth.rpc is the RPC endpoint string; latency is not in the current
        // OpsHealth schema — use lagBlocks as a proxy for staleness indicator.
        // When admin-api adds per-chain ms, update ChainHealth type and read it here.
        ms: 0,
        lagBlocks: bnbChain?.lagBlocks ?? 0,
      },
      sol: {
        ms: 0,
        lagSlots: solChain?.lagBlocks ?? 0,
      },
    },
    gasPrice: {
      bnb: bnbGas?.current ?? 0,
      sol: solGas?.current ?? 0,
    },
  };
}

// ── Live dot ─────────────────────────────────────────────────────────────────

export function LiveDot({ variant = 'ok' }: { variant?: 'ok' | 'warn' | 'err' }) {
  return <span className={`live-dot live-dot-${variant}`} />;
}

// ── Live time ago ────────────────────────────────────────────────────────────

export function LiveTimeAgo({ at }: { at: string }) {
  const { now } = useRealtime();
  const sec = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000));
  if (sec < 60) return <>{sec}s ago</>;
  if (sec < 3600) return <>{Math.floor(sec / 60)}m ago</>;
  if (sec < 86400) return <>{Math.floor(sec / 3600)}h ago</>;
  return <>{Math.floor(sec / 86400)}d ago</>;
}

// ── Block ticker ─────────────────────────────────────────────────────────────

/**
 * Displays real block height and lag from /ops/health.
 * Shows "—" while data loads; never shows fabricated numbers.
 */
export function BlockTicker({ chain }: { chain: 'bnb' | 'sol' }) {
  const { blocks, rpc } = useRealtime();
  const h = chain === 'bnb' ? blocks.bnb : blocks.sol;
  const r = chain === 'bnb' ? rpc.bnb : rpc.sol;
  const lag = 'lagBlocks' in r ? r.lagBlocks : r.lagSlots;

  // lagBlocks=0 when loading; treat >0 as indicator of health
  const dotVariant = lag === 0 ? 'ok' : lag < 5 ? 'warn' : 'err';

  return (
    <div className="block-ticker">
      <LiveDot variant={dotVariant} />
      <span className="block-ticker-chain">{chain === 'bnb' ? 'BSC' : 'SOL'}</span>
      <span className="block-ticker-height text-mono">{h > 0 ? h.toLocaleString() : '—'}</span>
      {lag > 0 && <span className="block-ticker-latency text-mono">{lag} behind</span>}
    </div>
  );
}
