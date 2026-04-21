import { AuthContext } from '@/auth/auth-provider';
import type { StaffUser } from '@/auth/auth-provider';
import { AppLayout } from '@/shell/app-layout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
// Smoke test — renders AppLayout with required providers, asserts sidebar + topbar present.
// Wagmi + Solana providers are mocked to avoid MetaMask SDK localStorage side-effects in jsdom.
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';

// Mock wagmi providers — WalletWidget uses useAccount/useDisconnect which require WagmiProvider.
// Mock at module level to prevent MetaMask SDK async init touching localStorage in jsdom.
vi.mock('@/providers/wagmi-provider', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
  wagmiConfig: {},
}));
vi.mock('@/providers/solana-provider', () => ({
  SolanaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// Mock wagmi hooks used by WalletWidget / ConnectWalletModal
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>();
  return {
    ...actual,
    useAccount: () => ({ address: undefined, isConnected: false, chain: undefined }),
    useDisconnect: () => ({ disconnect: vi.fn() }),
    useConnect: () => ({ connectors: [], connectAsync: vi.fn() }),
    useSignTypedData: () => ({ signTypedDataAsync: vi.fn() }),
  };
});
// Mock Solana wallet adapter hooks
vi.mock('@solana/wallet-adapter-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/wallet-adapter-react')>();
  return {
    ...actual,
    useWallet: () => ({
      wallets: [],
      select: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
      connecting: false,
      publicKey: null,
      wallet: null,
      signMessage: undefined,
    }),
    useConnection: () => ({ connection: {} }),
  };
});

// Minimal stub staff for auth context
const STUB_STAFF: StaffUser = {
  id: 'stf_test',
  name: 'Test User',
  email: 'test@treasury.io',
  role: 'admin',
  initials: 'TU',
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          staff: STUB_STAFF,
          loading: false,
          initiateLogin: vi.fn(),
          logout: vi.fn(),
          refresh: vi.fn(),
          hasPerm: () => true,
        }}
      >
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <Routes>
            <Route path="/app/*" element={ui}>
              <Route path="dashboard" element={<div data-testid="page-content">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('AppLayout', () => {
  it('renders sidebar and topbar', () => {
    renderWithProviders(<AppLayout />);
    // Sidebar brand mark
    expect(screen.getByText('W')).toBeDefined();
    // Sidebar nav — Dashboard link
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    // Topbar — sidebar toggle button (uses title attribute, not aria-label)
    expect(screen.getByTitle('Toggle sidebar')).toBeDefined();
  });

  it('renders page content via Outlet', () => {
    renderWithProviders(<AppLayout />);
    expect(screen.getByTestId('page-content')).toBeDefined();
  });
});
