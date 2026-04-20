// Token pill — renders a token amount (USDT/USDC) with brand mark + decimals.
// Ports prototype primitives.jsx `TokenPill`.
import type { TOKENS } from '@/lib/constants';

type TokenId = keyof typeof TOKENS;

interface Props {
  token: TokenId;
  /** When omitted renders just the symbol chip */
  amount?: number | string;
  decimals?: number;
}

export function TokenPill({ token, amount, decimals = 2 }: Props) {
  return (
    <span className="token-pill">
      <span className={`token-mark ${token.toLowerCase()}`}>{token === 'USDT' ? 'T' : 'C'}</span>
      {amount !== undefined ? (
        <>
          <span>
            {Number(amount).toLocaleString('en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
          </span>
          <span className="text-faint text-xs" style={{ marginLeft: 2 }}>
            {token}
          </span>
        </>
      ) : (
        <span>{token}</span>
      )}
    </span>
  );
}
