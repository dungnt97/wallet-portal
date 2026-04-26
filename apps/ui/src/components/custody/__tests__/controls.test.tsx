// Tests for components/custody/controls.tsx — Tabs, Filter, Toggle, Segmented.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Filter, Segmented, Tabs, Toggle } from '../controls';

// ── Mock icons ────────────────────────────────────────────────────────────────

vi.mock('@/icons', () => ({
  I: {
    X: ({ size }: { size: number }) => <span data-testid="icon-x" data-size={size} />,
    ChevronDown: ({ size }: { size: number }) => (
      <span data-testid="icon-chevron-down" data-size={size} />
    ),
  },
}));

// ── Tabs ──────────────────────────────────────────────────────────────────────

describe('Tabs', () => {
  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active', count: 3 },
    { value: 'closed', label: 'Closed', count: 0 },
  ];

  it('renders all tab buttons', () => {
    render(<Tabs tabs={tabs} value="all" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /active/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /closed/i })).toBeInTheDocument();
  });

  it('marks the active tab with "active" class', () => {
    render(<Tabs tabs={tabs} value="active" onChange={vi.fn()} />);
    const activeBtn = screen.getByRole('button', { name: /active/i });
    expect(activeBtn.className).toContain('active');
  });

  it('does not mark inactive tabs with "active" class', () => {
    render(<Tabs tabs={tabs} value="all" onChange={vi.fn()} />);
    const closedBtn = screen.getByRole('button', { name: /closed/i });
    expect(closedBtn.className).not.toContain('active');
  });

  it('calls onChange with the clicked tab value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} value="all" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /active/i }));
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('shows count badge when count is defined', () => {
    render(<Tabs tabs={tabs} value="all" onChange={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows count 0 badge', () => {
    render(<Tabs tabs={tabs} value="all" onChange={vi.fn()} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not show count badge when count is undefined', () => {
    const simpleTabs = [{ value: 'a', label: 'No Count' }];
    render(<Tabs tabs={simpleTabs} value="a" onChange={vi.fn()} />);
    // Should not have a span with a number inside
    const spans = document.querySelectorAll('.text-muted.text-xs');
    expect(spans.length).toBe(0);
  });

  it('applies tabs-embedded class when embedded=true', () => {
    const { container } = render(<Tabs tabs={tabs} value="all" onChange={vi.fn()} embedded />);
    expect(container.firstChild?.toString()).toBeTruthy();
    // biome-ignore lint/suspicious/noExplicitAny: DOM assertion
    expect((container.firstChild as any)?.className).toContain('tabs-embedded');
  });
});

// ── Filter ─────────────────────────────────────────────────────────────────────

describe('Filter', () => {
  it('renders filter label', () => {
    render(<Filter label="Status" />);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows value when provided', () => {
    render(<Filter label="Status" value="Active" active />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows X icon when active', () => {
    render(<Filter label="Chain" active onClear={vi.fn()} />);
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
  });

  it('shows ChevronDown icon when not active', () => {
    render(<Filter label="Chain" />);
    expect(screen.getByTestId('icon-chevron-down')).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Filter label="Chain" onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls onClear when X icon span is clicked', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(<Filter label="Chain" active onClear={onClear} />);
    await user.click(screen.getByTestId('icon-x'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('applies active class when active=true', () => {
    render(<Filter label="Chain" active />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('active');
  });
});

// ── Toggle ─────────────────────────────────────────────────────────────────────

describe('Toggle', () => {
  it('has aria-pressed=true when on', () => {
    render(<Toggle on={true} onChange={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('has aria-pressed=false when off', () => {
    render(<Toggle on={false} onChange={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies "on" class when on=true', () => {
    render(<Toggle on={true} onChange={vi.fn()} />);
    expect(screen.getByRole('button').className).toContain('on');
  });

  it('does not apply "on" class when on=false', () => {
    render(<Toggle on={false} onChange={vi.fn()} />);
    expect(screen.getByRole('button').className).not.toContain('on');
  });

  it('calls onChange with toggled value when clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle on={false} onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when on=true and clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle on={true} onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

// ── Segmented ──────────────────────────────────────────────────────────────────

describe('Segmented', () => {
  const options = [
    { value: 'day' as const, label: 'Day' },
    { value: 'week' as const, label: 'Week' },
    { value: 'month' as const, label: 'Month' },
  ];

  it('renders all options', () => {
    render(<Segmented options={options} value="day" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument();
  });

  it('marks active option with "active" class', () => {
    render(<Segmented options={options} value="week" onChange={vi.fn()} />);
    const weekBtn = screen.getByRole('button', { name: 'Week' });
    expect(weekBtn.className).toContain('active');
  });

  it('does not mark inactive options with "active" class', () => {
    render(<Segmented options={options} value="day" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Month' }).className).not.toContain('active');
  });

  it('calls onChange with clicked option value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Segmented options={options} value="day" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(onChange).toHaveBeenCalledWith('month');
  });
});
