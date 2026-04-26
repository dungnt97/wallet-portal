import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TokenPill } from '../token-pill';

vi.mock('@/lib/constants', () => ({
  TOKENS: { USDT: {}, USDC: {} },
}));

describe('TokenPill', () => {
  it('renders USDT mark with T', () => {
    render(<TokenPill token="USDT" />);
    expect(document.querySelector('.token-mark.usdt')).toHaveTextContent('T');
  });

  it('renders USDC mark with C', () => {
    render(<TokenPill token="USDC" />);
    expect(document.querySelector('.token-mark.usdc')).toHaveTextContent('C');
  });

  it('renders just symbol when no amount', () => {
    render(<TokenPill token="USDT" />);
    expect(screen.getByText('USDT')).toBeInTheDocument();
  });

  it('renders amount with default 2 decimals', () => {
    render(<TokenPill token="USDT" amount={1234.5} />);
    expect(screen.getByText('1,234.50')).toBeInTheDocument();
  });

  it('renders amount with custom decimals', () => {
    render(<TokenPill token="USDC" amount={100} decimals={4} />);
    expect(screen.getByText('100.0000')).toBeInTheDocument();
  });

  it('shows token label next to amount', () => {
    render(<TokenPill token="USDT" amount={50} />);
    expect(screen.getByText('USDT')).toBeInTheDocument();
  });

  it('renders amount=0 correctly', () => {
    render(<TokenPill token="USDT" amount={0} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  it('renders string amount', () => {
    render(<TokenPill token="USDC" amount="999.99" />);
    expect(screen.getByText('999.99')).toBeInTheDocument();
  });

  it('renders token-pill wrapper', () => {
    render(<TokenPill token="USDT" />);
    expect(document.querySelector('.token-pill')).toBeInTheDocument();
  });
});
