// App root — providers: Auth, StepUp, TanStack Query, i18n, Router
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from '@/auth/auth-provider';
import { StepUpProvider } from '@/auth/step-up-provider';
import { router } from '@/router';
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
      <AuthProvider>
        {/* StepUpProvider registers the 403 interceptor with the API client */}
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
