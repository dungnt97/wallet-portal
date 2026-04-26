// Tests for shell/mobile-nav.tsx — MobileNav overlay open/close behaviour.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MobileNav } from '../mobile-nav';

// ── Mock Sidebar ──────────────────────────────────────────────────────────────

vi.mock('../sidebar', () => ({
  Sidebar: ({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) => (
    <nav
      data-testid="sidebar"
      data-collapsed={String(collapsed)}
      onClick={onNavigate}
      onKeyDown={onNavigate}
    />
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MobileNav', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<MobileNav open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders scrim and drawer when open=true', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />);
    expect(document.querySelector('.mobile-nav-scrim')).toBeInTheDocument();
    expect(document.querySelector('.mobile-nav-drawer')).toBeInTheDocument();
  });

  it('renders the Sidebar inside the drawer when open', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('passes collapsed=false to Sidebar', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');
  });

  it('calls onClose when scrim is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MobileNav open={true} onClose={onClose} />);
    const scrim = document.querySelector('.mobile-nav-scrim') as HTMLElement;
    await user.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Sidebar navigation fires', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MobileNav open={true} onClose={onClose} />);
    await user.click(screen.getByTestId('sidebar'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
