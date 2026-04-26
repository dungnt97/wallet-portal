import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Hash } from '../hash';

vi.mock('@/icons', () => ({
  I: { Copy: () => <span data-testid="icon-copy" /> },
}));

vi.mock('@/lib/format', () => ({
  shortHash: (value: string, start: number, end: number) =>
    `${value.slice(0, start)}…${value.slice(-end)}`,
}));

describe('Hash', () => {
  it('renders dash when value is null', () => {
    render(<Hash value={null} />);
    expect(document.querySelector('.text-faint')).toHaveTextContent('—');
  });

  it('renders dash when value is undefined', () => {
    render(<Hash />);
    expect(document.querySelector('.text-faint')).toHaveTextContent('—');
  });

  it('renders shortened hash with default 6 chars', () => {
    render(<Hash value="0x1234567890abcdef" />);
    expect(document.querySelector('.hash')?.textContent).toContain('0x1234');
  });

  it('renders copy icon', () => {
    render(<Hash value="0xabc123" />);
    expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
  });

  it('renders hash wrapper with title attribute', () => {
    render(<Hash value="0xfullhash" />);
    expect(document.querySelector('.hash')).toHaveAttribute('title', '0xfullhash');
  });

  it('renders hash span wrapper', () => {
    render(<Hash value="0xabc" />);
    expect(document.querySelector('.hash')).toBeInTheDocument();
  });

  it('uses custom chars param', () => {
    render(<Hash value="0x1234567890abcdef" chars={4} />);
    const hashEl = document.querySelector('.hash');
    expect(hashEl?.textContent).toContain('0x12');
  });
});
