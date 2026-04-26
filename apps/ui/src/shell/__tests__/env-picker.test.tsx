// Tests for shell/env-picker.tsx — environment profile switcher pill.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size, style }: { size?: number; style?: object }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

const mockSetActiveProfileName = vi.fn();
let mockActiveProfileName = 'staging';

vi.mock('@/stores/env-store', () => ({
  ENV_PROFILES: [
    { name: 'production', apiUrl: 'https://prod.example.com' },
    { name: 'staging', apiUrl: 'https://staging.example.com' },
    { name: 'dev', apiUrl: 'https://dev.example.com' },
  ],
  MULTI_ENV_ENABLED: true,
  useEnvStore: (
    selector: (s: {
      activeProfileName: string;
      setActiveProfileName: typeof mockSetActiveProfileName;
    }) => unknown
  ) =>
    selector({
      activeProfileName: mockActiveProfileName,
      setActiveProfileName: mockSetActiveProfileName,
    }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { EnvPicker } from '../env-picker';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EnvPicker', () => {
  beforeEach(() => {
    mockActiveProfileName = 'staging';
    mockSetActiveProfileName.mockReset();
  });

  it('renders the pill button with current profile name', () => {
    render(<EnvPicker />);
    expect(screen.getByRole('button', { name: /STAGING/i })).toBeInTheDocument();
  });

  it('does not show menu by default', () => {
    render(<EnvPicker />);
    expect(screen.queryByText('shell.environment')).not.toBeInTheDocument();
  });

  it('opens menu on pill click', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    expect(screen.getByText('shell.environment')).toBeInTheDocument();
  });

  it('lists all env profiles in menu', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows api url of each profile', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    expect(screen.getByText('https://staging.example.com')).toBeInTheDocument();
  });

  it('shows warning text in menu', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    expect(screen.getByText('shell.envSwitchWarning')).toBeInTheDocument();
  });

  it('calls setActiveProfileName when a profile is selected', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    // Click on the "production" menu item
    const prodButtons = screen.getAllByRole('button');
    const prodBtn = prodButtons.find((b) => b.textContent?.includes('production'));
    await user.click(prodBtn as HTMLElement);
    expect(mockSetActiveProfileName).toHaveBeenCalledWith('production');
  });

  it('closes menu after profile selection', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    const prodButtons = screen.getAllByRole('button');
    const prodBtn = prodButtons.find((b) => b.textContent?.includes('production'));
    await user.click(prodBtn as HTMLElement);
    expect(screen.queryByText('shell.environment')).not.toBeInTheDocument();
  });

  it('shows check icon next to active profile', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    await user.click(screen.getByRole('button', { name: /STAGING/i }));
    // Active profile (staging) should have a Check icon
    expect(screen.getByTestId('icon-Check')).toBeInTheDocument();
  });

  it('toggles menu closed on second pill click', async () => {
    const user = userEvent.setup();
    render(<EnvPicker />);
    const pill = document.querySelector('.env-pill') as HTMLElement;
    await user.click(pill);
    expect(screen.getByText('shell.environment')).toBeInTheDocument();
    await user.click(pill);
    expect(screen.queryByText('shell.environment')).not.toBeInTheDocument();
  });

  it('renders ChevronDown icon in pill', () => {
    render(<EnvPicker />);
    expect(screen.getByTestId('icon-ChevronDown')).toBeInTheDocument();
  });
});
