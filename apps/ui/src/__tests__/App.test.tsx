// Smoke tests for src/App.tsx — renders without crashing, provider tree present.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────
// Mock heavy deps before any import of App so module resolution skips real impls.

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-client-provider">{children}</div>
  ),
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => <div data-testid="rq-devtools" />,
}));

vi.mock('react-router-dom', () => ({
  RouterProvider: ({ router }: { router: unknown }) => (
    <div data-testid="router-provider" data-has-router={!!router} />
  ),
}));

vi.mock('@/router', () => ({
  router: { id: 'mock-router' },
}));

vi.mock('@/providers/chain-providers', () => ({
  ChainProviders: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chain-providers">{children}</div>
  ),
}));

vi.mock('@/auth/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

vi.mock('@/auth/step-up-provider', () => ({
  StepUpProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="step-up-provider">{children}</div>
  ),
}));

// i18n is a side-effect import — mock to no-op
vi.mock('@/i18n', () => ({}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { render, screen } from '@testing-library/react';
import { App } from '../App';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByTestId('router-provider')).toBeInTheDocument();
  });

  it('wraps with QueryClientProvider', () => {
    render(<App />);
    expect(screen.getByTestId('query-client-provider')).toBeInTheDocument();
  });

  it('wraps with ChainProviders', () => {
    render(<App />);
    expect(screen.getByTestId('chain-providers')).toBeInTheDocument();
  });

  it('wraps with AuthProvider', () => {
    render(<App />);
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('wraps with StepUpProvider', () => {
    render(<App />);
    expect(screen.getByTestId('step-up-provider')).toBeInTheDocument();
  });

  it('passes router to RouterProvider', () => {
    render(<App />);
    expect(screen.getByTestId('router-provider')).toHaveAttribute('data-has-router', 'true');
  });

  it('renders devtools only in DEV when VITE_TEST_MODE is absent', () => {
    // vitest sets import.meta.env.DEV=true and VITE_TEST_MODE is not set,
    // so the condition `DEV && !VITE_TEST_MODE` is true → devtools render.
    render(<App />);
    expect(screen.getByTestId('rq-devtools')).toBeInTheDocument();
  });
});
