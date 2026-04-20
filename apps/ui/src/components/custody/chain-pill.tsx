// Chain pill — small badge showing a blockchain (BNB / Solana).
// Ports prototype primitives.jsx `ChainPill`.
import { CHAINS } from '@/lib/constants';

type ChainId = keyof typeof CHAINS;

interface Props {
  chain: ChainId;
  /** Pass false to hide the trailing short label (BNB/SOL) */
  label?: boolean;
}

export function ChainPill({ chain, label }: Props) {
  const c = CHAINS[chain];
  return (
    <span className="chain-pill">
      <span className={`chain-mark ${chain}`}>{chain === 'bnb' ? 'B' : 'S'}</span>
      {label === false ? null : <span>{c.short}</span>}
    </span>
  );
}
