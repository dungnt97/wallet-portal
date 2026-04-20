// Address — shortened on-chain address with optional chain mark.
// Ports prototype primitives.jsx `Address`.
import type { CHAINS } from '@/lib/constants';
import { shortHash } from '@/lib/format';

type ChainId = keyof typeof CHAINS;

interface Props {
  value?: string | null;
  chain?: ChainId;
}

export function Address({ value, chain }: Props) {
  if (!value) return <span className="text-faint">—</span>;
  return (
    <span className="address-line">
      {chain && (
        <span className={`chain-mark ${chain}`} style={{ width: 12, height: 12, fontSize: 7 }}>
          {chain === 'bnb' ? 'B' : 'S'}
        </span>
      )}
      <span className="addr">{shortHash(value, 6, 4)}</span>
    </span>
  );
}
