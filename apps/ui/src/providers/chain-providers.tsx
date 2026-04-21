// Chain providers composition — wraps EVM (wagmi) + Solana providers
// Single import for main.tsx; must nest inside QueryClientProvider
import type { ReactNode } from 'react';
import { SolanaProvider } from './solana-provider';
import { WagmiProvider } from './wagmi-provider';

interface Props {
  children: ReactNode;
}

/**
 * ChainProviders — composed EVM + Solana provider tree.
 *
 * Nesting order:
 *   QueryClientProvider (App.tsx)
 *     └── WagmiProvider        ← requires react-query context
 *           └── SolanaProvider ← independent, nested for clean tree
 *                 └── children
 */
export function ChainProviders({ children }: Props) {
  return (
    <WagmiProvider>
      <SolanaProvider>{children}</SolanaProvider>
    </WagmiProvider>
  );
}
