// Smoke tests for features/architecture/architecture-page.tsx — tab switching.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/components/custody', () => ({
  PageFrame: ({
    title,
    children,
  }: {
    title: React.ReactNode;
    eyebrow?: React.ReactNode;
    subtitle?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="page-frame">
      <h1>{title}</h1>
      {children}
    </div>
  ),
  Tabs: ({
    onChange,
    tabs,
  }: {
    value: string;
    onChange: (v: string) => void;
    tabs: Array<{ value: string; label: string }>;
    embedded?: boolean;
  }) => (
    <div data-testid="tabs">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

// Mock all tab sub-components
vi.mock('../tab-service-map', () => ({
  TabServiceMap: () => <div data-testid="tab-service-map" />,
}));
vi.mock('../tab-lifecycle', () => ({
  TabLifecycle: () => <div data-testid="tab-lifecycle" />,
}));
vi.mock('../tab-sequence', () => ({
  TabSequence: () => <div data-testid="tab-sequence" />,
}));
vi.mock('../tab-domain', () => ({
  TabDomain: () => <div data-testid="tab-domain" />,
}));
vi.mock('../tab-api', () => ({
  TabApi: () => <div data-testid="tab-api" />,
}));
vi.mock('../tab-jobs', () => ({
  TabJobs: () => <div data-testid="tab-jobs" />,
}));
vi.mock('../tab-security', () => ({
  TabSecurity: () => <div data-testid="tab-security" />,
}));
vi.mock('../tab-mvp', () => ({
  TabMvp: () => <div data-testid="tab-mvp" />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ArchitecturePage } from '../architecture-page';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ArchitecturePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page frame', () => {
    render(<ArchitecturePage />);
    expect(screen.getByTestId('page-frame')).toBeInTheDocument();
  });

  it('renders architecture title via t()', () => {
    render(<ArchitecturePage />);
    // useTranslation mock returns the key unchanged
    expect(screen.getByText('architecture.title')).toBeInTheDocument();
  });

  it('renders tabs', () => {
    render(<ArchitecturePage />);
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  it('shows service-map tab by default (overview)', () => {
    render(<ArchitecturePage />);
    expect(screen.getByTestId('tab-service-map')).toBeInTheDocument();
  });

  it('does not show other tabs by default', () => {
    render(<ArchitecturePage />);
    expect(screen.queryByTestId('tab-lifecycle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-api')).not.toBeInTheDocument();
  });

  it('switches to flows tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('Lifecycle flows'));
    expect(screen.getByTestId('tab-lifecycle')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-service-map')).not.toBeInTheDocument();
  });

  it('switches to sequence tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('Sequence diagrams'));
    expect(screen.getByTestId('tab-sequence')).toBeInTheDocument();
  });

  it('switches to api tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('API surface'));
    expect(screen.getByTestId('tab-api')).toBeInTheDocument();
  });

  it('switches to jobs tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('Background jobs'));
    expect(screen.getByTestId('tab-jobs')).toBeInTheDocument();
  });

  it('switches to security tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('Security'));
    expect(screen.getByTestId('tab-security')).toBeInTheDocument();
  });

  it('switches to mvp tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('MVP plan'));
    expect(screen.getByTestId('tab-mvp')).toBeInTheDocument();
  });

  it('switches to data tab', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByText('Domain model'));
    expect(screen.getByTestId('tab-domain')).toBeInTheDocument();
  });
});
