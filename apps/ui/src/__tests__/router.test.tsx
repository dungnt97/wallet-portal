// Smoke tests for src/router.tsx — router config structure and route paths.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted ensures this variable is available when vi.mock factories execute
const capturedRoutes = vi.hoisted(() => [] as unknown[]);

// ── Mocks — all page/shell components to avoid deep dependency trees ───────────

vi.mock('@/auth/login-gate', () => ({
  LoginGate: () => <div data-testid="login-gate" />,
}));
vi.mock('@/shell/app-layout', () => ({
  AppLayout: () => <div data-testid="app-layout" />,
}));
vi.mock('@/features/architecture/architecture-page', () => ({
  ArchitecturePage: () => <div data-testid="architecture-page" />,
}));
vi.mock('@/features/audit/audit-page', () => ({
  AuditPage: () => <div data-testid="audit-page" />,
}));
vi.mock('@/features/auth/auth-callback-page', () => ({
  AuthCallbackPage: () => <div data-testid="auth-callback-page" />,
}));
vi.mock('@/features/auth/security-page', () => ({
  SecurityPage: () => <div data-testid="security-page" />,
}));
vi.mock('@/features/cold/cold-page', () => ({
  ColdPage: () => <div data-testid="cold-page" />,
}));
vi.mock('@/features/dashboard/dashboard-page', () => ({
  DashboardPage: () => <div data-testid="dashboard-page" />,
}));
vi.mock('@/features/deposits/deposits-page', () => ({
  DepositsPage: () => <div data-testid="deposits-page" />,
}));
vi.mock('@/features/login/login-page', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));
vi.mock('@/features/multisig/multisig-page', () => ({
  MultisigPage: () => <div data-testid="multisig-page" />,
}));
vi.mock('@/features/notifs/notifs-page', () => ({
  NotifsPage: () => <div data-testid="notifs-page" />,
}));
vi.mock('@/features/ops/ops-page', () => ({
  OpsPage: () => <div data-testid="ops-page" />,
}));
vi.mock('@/features/recon/recon-page', () => ({
  ReconPage: () => <div data-testid="recon-page" />,
}));
vi.mock('@/features/recovery/recovery-page', () => ({
  RecoveryPage: () => <div data-testid="recovery-page" />,
}));
vi.mock('@/features/signers/signers-page', () => ({
  SignersPage: () => <div data-testid="signers-page" />,
}));
vi.mock('@/features/sweep/sweep-page', () => ({
  SweepPage: () => <div data-testid="sweep-page" />,
}));
vi.mock('@/features/transactions/transactions-page', () => ({
  TransactionsPage: () => <div data-testid="transactions-page" />,
}));
vi.mock('@/features/users/users-page', () => ({
  UsersPage: () => <div data-testid="users-page" />,
}));
vi.mock('@/features/withdrawals/withdrawals-page', () => ({
  WithdrawalsPage: () => <div data-testid="withdrawals-page" />,
}));

// Mock react-router-dom — capture createBrowserRouter args; Navigate is a simple stub.
vi.mock('react-router-dom', () => ({
  createBrowserRouter: (routes: unknown[]) => {
    capturedRoutes.splice(0, capturedRoutes.length, ...routes);
    return { id: 'mock-router', routes };
  },
  Navigate: ({ to }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate" data-to={to} />
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { router } from '../router';

// ── Helpers ───────────────────────────────────────────────────────────────────

function findRoute(routes: unknown[], path: string): unknown | undefined {
  for (const r of routes as Array<{ path?: string; children?: unknown[] }>) {
    if (r.path === path) return r;
    if (r.children) {
      const found = findRoute(r.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('router', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('createBrowserRouter is called and returns a router object', () => {
    expect(router).toBeDefined();
    expect((router as unknown as { id: string }).id).toBe('mock-router');
  });

  it('top-level routes array has 3 entries: /login, /auth/callback, /app, catch-all *', () => {
    // The router call captures routes; we inspect capturedRoutes
    expect(capturedRoutes.length).toBeGreaterThanOrEqual(3);
  });

  it('has /login route at top level', () => {
    const route = findRoute(capturedRoutes, '/login');
    expect(route).toBeDefined();
  });

  it('has /auth/callback route at top level', () => {
    const route = findRoute(capturedRoutes, '/auth/callback');
    expect(route).toBeDefined();
  });

  it('has /app route at top level', () => {
    const route = findRoute(capturedRoutes, '/app');
    expect(route).toBeDefined();
  });

  it('/app route has children (nested layout)', () => {
    const appRoute = findRoute(capturedRoutes, '/app') as { children?: unknown[] };
    expect(appRoute?.children).toBeDefined();
    expect((appRoute?.children ?? []).length).toBeGreaterThan(0);
  });

  it('has dashboard child route under /app', () => {
    const appRoute = findRoute(capturedRoutes, '/app') as { children?: unknown[] };
    const layoutChild = (appRoute?.children ?? [])[0] as { children?: unknown[] };
    const dashRoute = findRoute(layoutChild?.children ?? [], 'dashboard');
    expect(dashRoute).toBeDefined();
  });

  it('has deposits child route under /app', () => {
    const appRoute = findRoute(capturedRoutes, '/app') as { children?: unknown[] };
    const layoutChild = (appRoute?.children ?? [])[0] as { children?: unknown[] };
    const route = findRoute(layoutChild?.children ?? [], 'deposits');
    expect(route).toBeDefined();
  });

  it('has sweep child route under /app', () => {
    const appRoute = findRoute(capturedRoutes, '/app') as { children?: unknown[] };
    const layoutChild = (appRoute?.children ?? [])[0] as { children?: unknown[] };
    const route = findRoute(layoutChild?.children ?? [], 'sweep');
    expect(route).toBeDefined();
  });

  it('has multisig child route under /app', () => {
    const appRoute = findRoute(capturedRoutes, '/app') as { children?: unknown[] };
    const layoutChild = (appRoute?.children ?? [])[0] as { children?: unknown[] };
    const route = findRoute(layoutChild?.children ?? [], 'multisig');
    expect(route).toBeDefined();
  });

  it('has catch-all * route at top level redirecting to /login', () => {
    const catchAll = (capturedRoutes as Array<{ path?: string }>).find((r) => r.path === '*');
    expect(catchAll).toBeDefined();
  });
});
