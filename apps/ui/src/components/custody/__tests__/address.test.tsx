import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Address } from '../address';

vi.mock('@/lib/constants', () => ({
  CHAINS: { bnb: {}, sol: {} },
}));

vi.mock('@/lib/format', () => ({
  shortHash: (value: string, start: number, end: number) =>
    `${value.slice(0, start)}…${value.slice(-end)}`,
}));

describe('Address', () => {
  it('renders dash when value is null', () => {
    render(<Address value={null} />);
    expect(document.querySelector('.text-faint')).toHaveTextContent('—');
  });

  it('renders dash when value is undefined', () => {
    render(<Address />);
    expect(document.querySelector('.text-faint')).toHaveTextContent('—');
  });

  it('renders shortened address', () => {
    render(<Address value="0x1234567890abcdef" />);
    expect(document.querySelector('.addr')).toBeInTheDocument();
    expect(document.querySelector('.addr')?.textContent).toContain('0x1234');
  });

  it('renders BNB chain mark with B label', () => {
    render(<Address value="0xabc123" chain="bnb" />);
    expect(document.querySelector('.chain-mark.bnb')).toHaveTextContent('B');
  });

  it('renders SOL chain mark with S label', () => {
    render(<Address value="0xabc123" chain="sol" />);
    expect(document.querySelector('.chain-mark.sol')).toHaveTextContent('S');
  });

  it('does not render chain mark when chain omitted', () => {
    render(<Address value="0xabc123" />);
    expect(document.querySelector('.chain-mark')).not.toBeInTheDocument();
  });

  it('renders address-line wrapper', () => {
    render(<Address value="0xabc123" />);
    expect(document.querySelector('.address-line')).toBeInTheDocument();
  });
});
