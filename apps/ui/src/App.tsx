import { AuthProvider } from '@/auth/auth-provider';
import { StepUpProvider } from '@/auth/step-up-provider';
import { ChainProviders } from '@/providers/chain-providers';
import { router } from '@/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// App root — providers: TanStack Query, ChainProviders (wagmi+solana), Auth, StepUp, i18n, Router
import { RouterProvider } from 'react-router-dom';
import '@/i18n'; // initialise i18next side-effect

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ChainProviders must be inside QueryClientProvider — wagmi v2 requires react-query context */}
      <ChainProviders>
        <AuthProvider>
          {/* StepUpProvider registers the 403 interceptor with the API client */}
          <StepUpProvider>
            <RouterProvider router={router} />
          </StepUpProvider>
        </AuthProvider>
      </ChainProviders>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
