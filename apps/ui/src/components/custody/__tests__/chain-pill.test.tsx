import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChainPill } from '../chain-pill';

describe('ChainPill component', () => {
  it('renders BNB chain with correct icon and label', () => {
    render(<ChainPill chain="bnb" />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('BNB')).toBeInTheDocument();
  });

  it('renders SOL chain with correct icon and label', () => {
    render(<ChainPill chain="sol" />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('SOL')).toBeInTheDocument();
  });

  it('hides label when label prop is false', () => {
    const { rerender } = render(<ChainPill chain="bnb" label={false} />);
    expect(screen.queryByText('BNB')).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    rerender(<ChainPill chain="sol" label={false} />);
    expect(screen.queryByText('SOL')).not.toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('shows label by default', () => {
    render(<ChainPill chain="bnb" />);
    expect(screen.getByText('BNB')).toBeInTheDocument();
  });

  it('applies chain-pill CSS class', () => {
    const { container } = render(<ChainPill chain="bnb" />);
    expect(container.querySelector('.chain-pill')).toBeInTheDocument();
  });

  it('applies correct chain-mark class', () => {
    const { container: bnbContainer } = render(<ChainPill chain="bnb" />);
    expect(bnbContainer.querySelector('.chain-mark.bnb')).toBeInTheDocument();

    const { container: solContainer } = render(<ChainPill chain="sol" />);
    expect(solContainer.querySelector('.chain-mark.sol')).toBeInTheDocument();
  });
});
