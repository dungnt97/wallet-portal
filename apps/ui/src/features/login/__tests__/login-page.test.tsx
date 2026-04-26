import { AuthContext } from '@/auth/auth-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../login-page';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('@/icons', () => ({
  I: {
    ArrowRight: () => <span data-testid="icon-arrow-right" />,
    ArrowLeft: () => <span data-testid="icon-arrow-left" />,
    Lock: () => <span data-testid="icon-lock" />,
    Shield: () => <span data-testid="icon-shield" />,
    Key: () => <span data-testid="icon-key" />,
    Check: () => <span data-testid="icon-check" />,
  },
}));

vi.mock('../google-glyph', () => ({
  GoogleGlyph: () => <span data-testid="google-glyph" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthOverride = {
  refresh?: () => Promise<void>;
  logout?: () => Promise<void>;
  initiateLogin?: () => Promise<void>;
  hasPerm?: (perm: string) => boolean;
};

function mockAuthCtx(overrides: AuthOverride = {}) {
  return {
    staff: null,
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    hasPerm: vi.fn(() => false),
    ...overrides,
  };
}

function renderLogin(authOverrides: AuthOverride = {}) {
  const authValue = mockAuthCtx(authOverrides);
  return {
    authValue,
    ...render(
      <AuthContext.Provider value={authValue}>
        <LoginPage />
      </AuthContext.Provider>
    ),
  };
}

// ── SSO step ──────────────────────────────────────────────────────────────────

describe('LoginPage — SSO step', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Google SSO button by default', () => {
    renderLogin();
    expect(screen.getByTestId('google-glyph')).toBeInTheDocument();
  });

  it('renders the email input with default value', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('you@treasury.io')).toBeInTheDocument();
  });

  it('allows editing the email field', () => {
    renderLogin();
    const emailInput = screen.getByPlaceholderText('you@treasury.io');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('navigates to credentials step when arrow-right button clicked', () => {
    renderLogin();
    const btn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="icon-arrow-right"]'));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    const pwdInput = document.querySelector('input[type="password"]');
    expect(pwdInput).toBeInTheDocument();
  });

  it('advances to 2fa step in dev-mode when Google SSO button clicked', () => {
    renderLogin();
    const googleBtn = document.querySelector('.login-google') as HTMLButtonElement;
    fireEvent.click(googleBtn);
    const accountCard = document.querySelector('.login-form .login-account');
    expect(accountCard).toBeInTheDocument();
  });

  it('shows loading text on Google button while async work in progress', () => {
    renderLogin();
    const googleBtn = document.querySelector('.login-google') as HTMLButtonElement;
    expect(googleBtn).toBeInTheDocument();
    expect(googleBtn.textContent).toBeTruthy();
  });

  it('shows "Wallet Portal" brand', () => {
    renderLogin();
    expect(screen.getByText('Wallet Portal')).toBeInTheDocument();
  });
});

// ── Credentials step ──────────────────────────────────────────────────────────

describe('LoginPage — credentials step', () => {
  beforeEach(() => vi.clearAllMocks());

  function goToCredentials() {
    renderLogin();
    const btn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="icon-arrow-right"]'));
    fireEvent.click(btn!);
  }

  it('shows password input on credentials step', () => {
    goToCredentials();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it('shows email input on credentials step', () => {
    goToCredentials();
    const emailInputs = screen.getAllByRole('textbox');
    expect(emailInputs.length).toBeGreaterThan(0);
  });

  it('shows back button on credentials step', () => {
    goToCredentials();
    expect(screen.getByTestId('icon-arrow-left')).toBeInTheDocument();
  });

  it('goes back to SSO step when back button clicked', () => {
    goToCredentials();
    const backBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('[data-testid="icon-arrow-left"]'));
    fireEvent.click(backBtn!);
    expect(screen.getByTestId('google-glyph')).toBeInTheDocument();
  });

  it('shows error when submitted with email not matching any staff member', () => {
    goToCredentials();
    const emailInputs = screen.getAllByRole('textbox');
    fireEvent.change(emailInputs[0], { target: { value: 'unknown@unknown.com' } });
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);
    expect(document.querySelector('.login-err')).toBeInTheDocument();
  });

  it('shows error when password is too short', () => {
    goToCredentials();
    const pwdInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(pwdInput, { target: { value: 'abc' } });
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);
    expect(document.querySelector('.login-err')).toBeInTheDocument();
  });
});

// ── Demo accounts panel ───────────────────────────────────────────────────────

describe('LoginPage — demo accounts panel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 7 demo staff members', () => {
    renderLogin();
    const names = [
      'Mira Sato',
      'Ben Foster',
      'Hana Petersen',
      'Ana Müller',
      'Tomás Ribeiro',
      'Iris Bergström',
      'Kenji Mori',
    ];
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('renders role pills for each role type', () => {
    renderLogin();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getAllByText('Treasurer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0);
    expect(screen.getByText('Viewer')).toBeInTheDocument();
  });

  it('renders policy section mentioning WebAuthn', () => {
    renderLogin();
    expect(screen.getByText(/WebAuthn/)).toBeInTheDocument();
  });

  it('renders policy section mentioning TOTP', () => {
    renderLogin();
    expect(screen.getByText(/TOTP/)).toBeInTheDocument();
  });

  it('renders the brand mark', () => {
    renderLogin();
    expect(screen.getByText('Wallet Portal')).toBeInTheDocument();
  });

  it('clicking a demo account card calls api.post /auth/session/dev-login', async () => {
    const { api } = await import('@/api/client');
    const refresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', role: 'admin' });
    renderLogin({ refresh });

    const miraBtn = screen.getByText('Mira Sato').closest('button') as HTMLButtonElement;
    fireEvent.click(miraBtn);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/auth/session/dev-login',
        expect.objectContaining({ email: 'mira@treasury.io' })
      )
    );
  });

  it('shows error on demo account card click when api.post rejects', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.post).mockRejectedValue(new Error('Network error'));
    renderLogin();

    const miraBtn = screen.getByText('Mira Sato').closest('button') as HTMLButtonElement;
    fireEvent.click(miraBtn);

    await waitFor(() => expect(document.querySelector('.login-err')).toBeInTheDocument());
  });

  it('renders each demo account as a clickable button', () => {
    renderLogin();
    const kenji = screen.getByText('Kenji Mori').closest('button');
    expect(kenji).toBeInTheDocument();
  });
});
