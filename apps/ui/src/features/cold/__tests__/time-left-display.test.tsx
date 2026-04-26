// Tests for features/cold/time-left-display.tsx — TimeLeftDisplay countdown component.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeLeftDisplay } from '../time-left-display';

// ── Mock i18n ─────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── Mock useTimeLeft ──────────────────────────────────────────────────────────

const mockUseTimeLeft = vi.fn();

vi.mock('@/hooks/use-time-left', () => ({
  useTimeLeft: (unlockAt: string | null | undefined) => mockUseTimeLeft(unlockAt),
}));

describe('TimeLeftDisplay', () => {
  it('renders "unlocked" badge when expired', () => {
    mockUseTimeLeft.mockReturnValue({ expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2020-01-01T00:00:00Z" />);
    expect(screen.getByText('withdrawals.timelock.unlocked')).toBeInTheDocument();
  });

  it('unlocked badge has ok class', () => {
    mockUseTimeLeft.mockReturnValue({ expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2020-01-01T00:00:00Z" />);
    const el = screen.getByText('withdrawals.timelock.unlocked');
    expect(el.className).toContain('ok');
  });

  it('renders locked badge when not expired', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 2, minutes: 30, seconds: 5 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" />);
    expect(screen.getByText('withdrawals.timelock.locked')).toBeInTheDocument();
  });

  it('renders hours, minutes, seconds in non-compact mode', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 2, minutes: 30, seconds: 5 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" />);
    expect(screen.getByText('2h 30m 5s')).toBeInTheDocument();
  });

  it('renders days when days > 0', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 1, hours: 3, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" />);
    expect(screen.getByText('1d 3h 0m 0s')).toBeInTheDocument();
  });

  it('does not render days part when days === 0', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 1, minutes: 15, seconds: 3 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" />);
    const timeText = screen.getByText('1h 15m 3s');
    expect(timeText.textContent).not.toContain('0d');
  });

  it('renders remaining label in non-compact mode', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 1, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" />);
    expect(screen.getByText('withdrawals.timelock.remaining')).toBeInTheDocument();
  });

  it('renders compact single-line format when compact=true', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 1, minutes: 15, seconds: 3 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" compact />);
    const el = screen.getByText('1h 15m 3s');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('text-mono');
  });

  it('does not render locked badge in compact mode', () => {
    mockUseTimeLeft.mockReturnValue({ expired: false, days: 0, hours: 1, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2099-01-01T00:00:00Z" compact />);
    expect(screen.queryByText('withdrawals.timelock.locked')).not.toBeInTheDocument();
  });

  it('passes unlockAt to useTimeLeft', () => {
    mockUseTimeLeft.mockReturnValue({ expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt="2025-06-01T00:00:00Z" />);
    expect(mockUseTimeLeft).toHaveBeenCalledWith('2025-06-01T00:00:00Z');
  });

  it('passes null unlockAt through', () => {
    mockUseTimeLeft.mockReturnValue({ expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
    render(<TimeLeftDisplay unlockAt={null} />);
    expect(mockUseTimeLeft).toHaveBeenCalledWith(null);
  });
});
