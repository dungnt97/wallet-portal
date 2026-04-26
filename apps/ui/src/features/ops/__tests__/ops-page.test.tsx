import { AuthContext } from '@/auth/auth-provider';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpsPage } from '../ops-page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/custody', () => ({
  PageFrame: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('../health-status-grid', () => ({
  HealthStatusGrid: () => <div data-testid="health-status-grid" />,
}));

vi.mock('../kill-switch-card', () => ({
  KillSwitchCard: () => <div data-testid="kill-switch-card" />,
}));

vi.mock('../backup-card', () => ({
  BackupCard: () => <div data-testid="backup-card" />,
}));

vi.mock('../staff-sync-card', () => ({
  StaffSyncCard: () => <div data-testid="staff-sync-card" />,
}));

vi.mock('../use-ops-socket', () => ({
  useOpsSocket: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderOpsPage(hasPerm: (perm: string) => boolean) {
  const authCtx = {
    staff: {
      id: 'u1',
      name: 'Test User',
      email: 't@t.com',
      role: 'admin' as const,
      initials: 'TU',
    },
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    hasPerm,
  };
  return render(
    <AuthContext.Provider value={authCtx}>
      <OpsPage />
    </AuthContext.Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OpsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows unauthorized message when ops.read permission denied', () => {
    renderOpsPage(() => false);
    expect(screen.queryByTestId('health-status-grid')).not.toBeInTheDocument();
  });

  it('renders health grid when ops.read permitted', () => {
    renderOpsPage((perm) => perm === 'ops.read');
    expect(screen.getByTestId('health-status-grid')).toBeInTheDocument();
  });

  it('renders kill-switch card when ops.killswitch.toggle permitted', () => {
    renderOpsPage((perm) => ['ops.read', 'ops.killswitch.toggle'].includes(perm));
    expect(screen.getByTestId('kill-switch-card')).toBeInTheDocument();
  });

  it('does not render kill-switch card when ops.killswitch.toggle denied', () => {
    renderOpsPage((perm) => perm === 'ops.read');
    expect(screen.queryByTestId('kill-switch-card')).not.toBeInTheDocument();
  });

  it('renders backup card when ops.killswitch.toggle permitted', () => {
    renderOpsPage((perm) => ['ops.read', 'ops.killswitch.toggle'].includes(perm));
    expect(screen.getByTestId('backup-card')).toBeInTheDocument();
  });

  it('renders staff-sync card when staff.manage permitted', () => {
    renderOpsPage((perm) => ['ops.read', 'staff.manage'].includes(perm));
    expect(screen.getByTestId('staff-sync-card')).toBeInTheDocument();
  });

  it('does not render staff-sync card when staff.manage denied', () => {
    renderOpsPage((perm) => perm === 'ops.read');
    expect(screen.queryByTestId('staff-sync-card')).not.toBeInTheDocument();
  });

  it('full admin sees all sections', () => {
    renderOpsPage(() => true);
    expect(screen.getByTestId('health-status-grid')).toBeInTheDocument();
    expect(screen.getByTestId('kill-switch-card')).toBeInTheDocument();
    expect(screen.getByTestId('backup-card')).toBeInTheDocument();
    expect(screen.getByTestId('staff-sync-card')).toBeInTheDocument();
  });
});
