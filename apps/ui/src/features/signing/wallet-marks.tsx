// Wallet brand marks — MetaMask / Phantom / WalletConnect / Ledger SVGs.
// Ported from prototype signing_modals.jsx WalletMark.
export type WalletKind = 'metamask' | 'phantom' | 'walletconnect' | 'ledger';

interface Props {
  kind: WalletKind;
  size?: number;
}

export function WalletMark({ kind, size = 24 }: Props) {
  if (kind === 'metamask') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M33 6 L22 14 L24 10 Z" fill="#E17726" />
        <path d="M7 6 L18 14 L16 10 Z" fill="#E27625" />
        <path d="M29 27 L26 32 L33 34 L35 27 Z" fill="#E27625" />
        <path d="M5 27 L7 34 L14 32 L11 27 Z" fill="#E27625" />
        <path d="M13 18 L11 21 L18 22 L17 15 Z" fill="#E27625" />
        <path d="M27 18 L23 15 L22 22 L29 21 Z" fill="#E27625" />
        <path d="M14 32 L18 30 L15 27 Z" fill="#D5BFB2" />
        <path d="M22 30 L26 32 L25 27 Z" fill="#D5BFB2" />
      </svg>
    );
  }
  if (kind === 'phantom') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="phg" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#534BB1" />
            <stop offset="1" stopColor="#551BF9" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#phg)" />
        <path
          d="M32 20c0 5-4 9-9 9h-3.5c-.4 0-.6-.4-.4-.7l2-3.5c.1-.2.4-.3.6-.3h1.5c2.5 0 4.5-2 4.5-4.5s-2-4.5-4.5-4.5H15c-2.8 0-5 2.2-5 5v2c0 .4-.3.7-.7.7H8c-.6 0-1-.5-1-1V19c0-5 4-9 9-9h8c5 0 9 4 9 9z"
          fill="#fff"
        />
      </svg>
    );
  }
  if (kind === 'walletconnect') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="#3B99FC" />
        <path
          d="M12 16c4.5-4.5 11.5-4.5 16 0l.6.6c.3.3.3.7 0 1l-2.1 2c-.2.2-.5.2-.6 0l-.8-.8c-3.4-3.4-9-3.4-12.4 0l-.9.9c-.2.2-.4.2-.6 0l-2.1-2c-.3-.3-.3-.7 0-1l.9-.7z"
          fill="#fff"
        />
      </svg>
    );
  }
  if (kind === 'ledger') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="#000" />
        <path
          d="M10 13h8v3h-5v8h-3v-11z M22 13h8v11h-8v-3h5v-5h-5v-3z M10 28h20v2h-20z"
          fill="#fff"
        />
      </svg>
    );
  }
  return null;
}
