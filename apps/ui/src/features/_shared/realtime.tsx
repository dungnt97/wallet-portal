// Realtime helpers — ports prototype realtime.jsx (LiveDot, LiveTimeAgo, BlockTicker)
// No provider dependency: useRealtime drives a shared tick via a module-level
// store + subscribers so every consumer re-renders once per second in unison.
import { useEffect, useState } from 'react';

interface RealtimeState {
  now: number;
  blocks: { bnb: number; sol: number };
  rpc: {
    bnb: { ms: number; lagBlocks: number };
    sol: { ms: number; lagSlots: number };
  };
  gasPrice: { bnb: number; sol: number };
}

const initial: RealtimeState = {
  now: Date.now(),
  blocks: { bnb: 38_442_109, sol: 285_002_914 },
  rpc: {
    bnb: { ms: 38, lagBlocks: 2 },
    sol: { ms: 124, lagSlots: 14 },
  },
  gasPrice: { bnb: 3.0, sol: 0.000005 },
};

let state = initial;
const subs = new Set<() => void>();
let timer: number | null = null;

function tick() {
  state = {
    now: Date.now(),
    blocks: {
      bnb: state.blocks.bnb + (Math.random() < 0.35 ? 1 : 0),
      sol: state.blocks.sol + Math.floor(2 + Math.random() * 3),
    },
    rpc: {
      bnb: {
        ms: Math.max(22, Math.round(state.rpc.bnb.ms + (Math.random() - 0.5) * 8)),
        lagBlocks: Math.max(
          0,
          Math.min(4, state.rpc.bnb.lagBlocks + (Math.random() < 0.2 ? 1 : 0))
        ),
      },
      sol: {
        ms: Math.max(80, Math.round(state.rpc.sol.ms + (Math.random() - 0.5) * 16)),
        lagSlots: Math.max(
          4,
          Math.min(24, state.rpc.sol.lagSlots + Math.round((Math.random() - 0.5) * 4))
        ),
      },
    },
    gasPrice: {
      bnb: Math.max(1.0, +(state.gasPrice.bnb + (Math.random() - 0.5) * 0.3).toFixed(2)),
      sol: state.gasPrice.sol,
    },
  };
  for (const fn of subs) fn();
}

function ensureRunning() {
  if (timer === null && subs.size > 0) {
    timer = window.setInterval(tick, 1000);
  }
}

function maybeStop() {
  if (subs.size === 0 && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function useRealtime(): RealtimeState {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    ensureRunning();
    return () => {
      subs.delete(fn);
      maybeStop();
    };
  }, []);
  return state;
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
export function BlockTicker({ chain }: { chain: 'bnb' | 'sol' }) {
  const { blocks, rpc } = useRealtime();
  const h = chain === 'bnb' ? blocks.bnb : blocks.sol;
  const r = chain === 'bnb' ? rpc.bnb : rpc.sol;
  return (
    <div className="block-ticker">
      <LiveDot variant={r.ms < 100 ? 'ok' : r.ms < 200 ? 'warn' : 'err'} />
      <span className="block-ticker-chain">{chain === 'bnb' ? 'BSC' : 'SOL'}</span>
      <span className="block-ticker-height text-mono">{h.toLocaleString()}</span>
      <span className="block-ticker-latency text-mono">{r.ms}ms</span>
    </div>
  );
}
