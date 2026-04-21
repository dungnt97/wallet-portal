import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { LedgerWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
// Solana provider — ConnectionProvider + WalletProvider for Devnet
// Wallets: Phantom, Solflare, Ledger (Ed25519 HW path, D0.2)
import { type ReactNode, useMemo } from 'react';

// Import default wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

const SOLANA_DEVNET_RPC = import.meta.env.VITE_SOLANA_DEVNET_RPC ?? clusterApiUrl('devnet');

interface Props {
  children: ReactNode;
}

/**
 * SolanaProvider — wraps ConnectionProvider + WalletProvider + WalletModalProvider.
 * Targets Solana Devnet. Supports Phantom, Solflare, Ledger.
 */
export function SolanaProvider({ children }: Props) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new LedgerWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
