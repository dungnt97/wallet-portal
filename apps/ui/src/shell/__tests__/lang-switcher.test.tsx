import { useTweaksStore } from '@/stores/tweaks-store';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangSwitcher } from '../lang-switcher';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
  return { ...actual, persist: (fn: any) => fn };
});

vi.mock('@/icons', () => ({
  I: { Globe: () => <span data-testid="icon-globe" /> },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LangSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTweaksStore.setState({ lang: 'en' });
  });

  it('renders the globe icon button', () => {
    render(<LangSwitcher />);
    expect(screen.getByTestId('icon-globe')).toBeInTheDocument();
  });

  it('shows EN label when lang is en', () => {
    useTweaksStore.setState({ lang: 'en' });
    render(<LangSwitcher />);
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('shows VI label when lang is vi', () => {
    useTweaksStore.setState({ lang: 'vi' });
    render(<LangSwitcher />);
    expect(screen.getByText('VI')).toBeInTheDocument();
  });

  it('dropdown is closed by default', () => {
    render(<LangSwitcher />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens dropdown when button clicked', () => {
    render(<LangSwitcher />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows English and Tiếng Việt options in dropdown', () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Tiếng Việt')).toBeInTheDocument();
  });

  it('clicking English sets lang to en in store', () => {
    useTweaksStore.setState({ lang: 'vi' });
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    const englishBtn = screen.getByRole('menuitemradio', { name: /English/i });
    fireEvent.click(englishBtn);
    expect(useTweaksStore.getState().lang).toBe('en');
  });

  it('clicking Tiếng Việt sets lang to vi in store', () => {
    useTweaksStore.setState({ lang: 'en' });
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    const viBtn = screen.getByRole('menuitemradio', { name: /Tiếng Việt/i });
    fireEvent.click(viBtn);
    expect(useTweaksStore.getState().lang).toBe('vi');
  });

  it('closes dropdown after language selected', () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    const englishBtn = screen.getByRole('menuitemradio', { name: /English/i });
    fireEvent.click(englishBtn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes dropdown on outside mousedown', () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('active language option has aria-checked=true', () => {
    useTweaksStore.setState({ lang: 'en' });
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    const enItem = screen.getByRole('menuitemradio', { name: /English/i });
    expect(enItem).toHaveAttribute('aria-checked', 'true');
  });

  it('inactive language option has aria-checked=false', () => {
    useTweaksStore.setState({ lang: 'en' });
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    const viItem = screen.getByRole('menuitemradio', { name: /Tiếng Việt/i });
    expect(viItem).toHaveAttribute('aria-checked', 'false');
  });

  it('trigger button has aria-haspopup=menu', () => {
    render(<LangSwitcher />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('trigger has aria-expanded=false when closed', () => {
    render(<LangSwitcher />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('trigger has aria-expanded=true when open', () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});
