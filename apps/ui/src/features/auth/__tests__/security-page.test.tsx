// Tests for features/auth/security-page.tsx — WebAuthn key registration flow.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockApiPost = vi.fn();
vi.mock('@/api/client', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

const mockStartRegistration = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: (...args: unknown[]) => mockStartRegistration(...args),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/features/security/login-history', () => ({
  LoginHistory: () => <div data-testid="login-history" />,
}));

// lucide-react — stub all icons used by security-page
vi.mock('lucide-react', () => ({
  CheckCircle2: ({ size }: { size?: number }) => <span data-testid="icon-check-circle" />,
  KeyRound: ({ size }: { size?: number }) => <span data-testid="icon-key-round" />,
  Loader2: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="icon-loader2" />
  ),
  ShieldCheck: ({ size }: { size?: number }) => <span data-testid="icon-shield-check" />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { SecurityPage } from '../security-page';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders security keys heading', () => {
    render(<SecurityPage />);
    expect(screen.getByText('auth.securityKeys')).toBeInTheDocument();
  });

  it('renders device name input with default value', () => {
    render(<SecurityPage />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('My Security Key');
  });

  it('renders add security key button', () => {
    render(<SecurityPage />);
    // 'auth.addSecurityKey' appears twice: card header + button text
    expect(screen.getAllByText('auth.addSecurityKey').length).toBeGreaterThanOrEqual(1);
  });

  it('renders login history component', () => {
    render(<SecurityPage />);
    expect(screen.getByTestId('login-history')).toBeInTheDocument();
  });

  it('allows editing device name', () => {
    render(<SecurityPage />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My YubiKey 5' } });
    expect(input.value).toBe('My YubiKey 5');
  });

  it('shows pending state (spinner) while registration in progress', async () => {
    // api.post for options resolves; startRegistration never resolves (stay in pending)
    mockApiPost.mockResolvedValueOnce({ challenge: 'abc' });
    mockStartRegistration.mockReturnValue(new Promise(() => {}));

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(screen.getByText('auth.followBrowserPrompt')).toBeInTheDocument();
    });
  });

  it('disables input while pending', async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: 'abc' });
    mockStartRegistration.mockReturnValue(new Promise(() => {}));

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  it('shows success state after registration completes', async () => {
    mockApiPost
      .mockResolvedValueOnce({ challenge: 'opts' }) // register/options
      .mockResolvedValueOnce(undefined); // register/verify
    mockStartRegistration.mockResolvedValue({ id: 'cred-1', type: 'public-key' });

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(screen.getByText('auth.keyRegisteredSuccess')).toBeInTheDocument();
    });
  });

  it('shows error message when api.post for options rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows auth.registrationCancelled when NotAllowedError thrown', async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: 'opts' });
    const err = new Error('User cancelled');
    err.name = 'NotAllowedError';
    mockStartRegistration.mockRejectedValue(err);

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(screen.getByText('auth.registrationCancelled')).toBeInTheDocument();
    });
  });

  it('shows auth.registrationFailed when non-Error thrown', async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: 'opts' });
    mockStartRegistration.mockRejectedValue('string-error');

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(screen.getByText('auth.registrationFailed')).toBeInTheDocument();
    });
  });

  it('calls api.post with deviceName and correct path for options', async () => {
    mockApiPost.mockResolvedValueOnce({ challenge: 'opts' });
    mockStartRegistration.mockReturnValue(new Promise(() => {}));

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/auth/webauthn/register/options', {
        deviceName: 'My Security Key',
      });
    });
  });

  it('calls api.post verify with registration response', async () => {
    const regResp = { id: 'cred-2', type: 'public-key' };
    mockApiPost.mockResolvedValueOnce({ challenge: 'opts' }).mockResolvedValueOnce(undefined);
    mockStartRegistration.mockResolvedValue(regResp);

    render(<SecurityPage />);
    fireEvent.click(screen.getByRole('button', { name: /auth\.addSecurityKey/ }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/auth/webauthn/register/verify', regResp);
    });
  });
});
