import { useTweaksStore } from '@/stores/tweaks-store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TweaksPanel } from '../tweaks-panel';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
  return { ...actual, persist: (fn: any) => fn };
});

vi.mock('@/icons', () => ({
  I: { X: () => <span data-testid="icon-x" /> },
}));

type SegOption = { value: string; label: string };

vi.mock('@/components/custody', () => ({
  Segmented: ({
    options,
    value,
    onChange,
  }: { options: SegOption[]; value: string; onChange: (v: string) => void }) => (
    <div data-testid={`segmented-${value}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={`seg-btn-${o.value}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  Toggle: ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" data-testid={`toggle-${on ? 'on' : 'off'}`} onClick={() => onChange(!on)}>
      {on ? 'on' : 'off'}
    </button>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TweaksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTweaksStore.setState({
      theme: 'light',
      density: 'comfortable',
      accent: 'indigo',
      typography: 'mono',
      lang: 'en',
      sidebarCollapsed: false,
      showRiskFlags: true,
    });
  });

  it('renders the tweaks panel', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(document.querySelector('.tweaks-panel')).toBeInTheDocument();
  });

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<TweaksPanel onClose={onClose} />);
    const closeBtn = document.querySelector('.tweaks-header .icon-btn') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders language segmented control', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByTestId('seg-btn-en')).toBeInTheDocument();
    expect(screen.getByTestId('seg-btn-vi')).toBeInTheDocument();
  });

  it('renders theme segmented control (light/dark)', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByTestId('seg-btn-light')).toBeInTheDocument();
    expect(screen.getByTestId('seg-btn-dark')).toBeInTheDocument();
  });

  it('renders density segmented control', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByTestId('seg-btn-compact')).toBeInTheDocument();
    expect(screen.getByTestId('seg-btn-comfortable')).toBeInTheDocument();
    expect(screen.getByTestId('seg-btn-cozy')).toBeInTheDocument();
  });

  it('renders typography segmented control', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByTestId('seg-btn-sans')).toBeInTheDocument();
    expect(screen.getByTestId('seg-btn-mono')).toBeInTheDocument();
  });

  it('renders accent color swatches', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    const swatches = document.querySelectorAll('.tweak-swatch');
    expect(swatches.length).toBe(5);
  });

  it('clicking theme dark updates store', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('seg-btn-dark'));
    expect(useTweaksStore.getState().theme).toBe('dark');
  });

  it('clicking lang vi updates store', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('seg-btn-vi'));
    expect(useTweaksStore.getState().lang).toBe('vi');
  });

  it('clicking density compact updates store', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('seg-btn-compact'));
    expect(useTweaksStore.getState().density).toBe('compact');
  });

  it('clicking typography sans updates store', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('seg-btn-sans'));
    expect(useTweaksStore.getState().typography).toBe('sans');
  });

  it('clicking accent swatch updates store', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    const emeraldSwatch = document.querySelector('[title="emerald"]') as HTMLButtonElement;
    fireEvent.click(emeraldSwatch);
    expect(useTweaksStore.getState().accent).toBe('emerald');
  });

  it('sidebar toggle reflects current state (not collapsed = on)', () => {
    useTweaksStore.setState({ sidebarCollapsed: false, showRiskFlags: true });
    render(<TweaksPanel onClose={vi.fn()} />);
    const onToggles = screen.getAllByTestId('toggle-on');
    expect(onToggles.length).toBe(2);
  });

  it('risk flags toggle reflects current state', () => {
    useTweaksStore.setState({ showRiskFlags: true });
    render(<TweaksPanel onClose={vi.fn()} />);
    const toggles = screen.getAllByTestId('toggle-on');
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('renders sidebar toggle row', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
  });

  it('renders risk flags toggle row', () => {
    render(<TweaksPanel onClose={vi.fn()} />);
    expect(screen.getByText('Risk flags')).toBeInTheDocument();
  });
});
