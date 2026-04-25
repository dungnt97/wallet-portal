import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Risk, type RiskLevel } from '../risk';

describe('Risk component', () => {
  it('renders null when level is not provided', () => {
    const { container } = render(<Risk />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when level is null', () => {
    const { container } = render(<Risk level={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders low risk with dot marker', () => {
    render(<Risk level="low" />);
    expect(screen.getByText(/low/)).toBeInTheDocument();
    expect(screen.getByText(/·/)).toBeInTheDocument();
  });

  it('renders medium risk with exclamation marker', () => {
    render(<Risk level="med" />);
    expect(screen.getByText(/med/)).toBeInTheDocument();
    expect(screen.getByText(/!/)).toBeInTheDocument();
  });

  it('renders high risk with double exclamation marker', () => {
    render(<Risk level="high" />);
    expect(screen.getByText(/high/)).toBeInTheDocument();
    expect(screen.getByText(/!!/)).toBeInTheDocument();
  });

  it('applies correct CSS class based on risk level', () => {
    const { container: lowContainer } = render(<Risk level="low" />);
    expect(lowContainer.querySelector('.risk.low')).toBeInTheDocument();

    const { container: medContainer } = render(<Risk level="med" />);
    expect(medContainer.querySelector('.risk.med')).toBeInTheDocument();

    const { container: highContainer } = render(<Risk level="high" />);
    expect(highContainer.querySelector('.risk.high')).toBeInTheDocument();
  });
});
