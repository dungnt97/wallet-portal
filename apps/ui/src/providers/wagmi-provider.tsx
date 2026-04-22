// EVM provider — wagmi v2 config targeting BNB Chapel testnet
// Connectors: MetaMask, WalletConnect, (Ledger via WalletConnect)
import type { ReactNode } from 'react';
import { bscTestnet } from 'viem/chains';
import { http, WagmiProvider as BaseWagmiProvider, createConfig } from 'wagmi';
import { coinbaseWallet, metaMask, walletConnect } from 'wagmi/connectors';

const BNB_CHAPEL_RPC =
  import.meta.env.VITE_BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

const wcProjectId: string = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';

// WalletConnect covers Ledger Connect Kit path (D0.2)
// Coinbase Wallet is self-configured — no env var required
const connectors = [
  metaMask(),
  ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  coinbaseWallet({ appName: 'Wallet Portal' }),
];

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors,
  transports: {
    [bscTestnet.id]: http(BNB_CHAPEL_RPC),
  },
});

interface Props {
  children: ReactNode;
}

/**
 * WagmiProvider — wraps wagmi v2 config.
 * Must be placed inside QueryClientProvider (wagmi requires react-query context).
 */
export function WagmiProvider({ children }: Props) {
  return <BaseWagmiProvider config={wagmiConfig}>{children}</BaseWagmiProvider>;
}
