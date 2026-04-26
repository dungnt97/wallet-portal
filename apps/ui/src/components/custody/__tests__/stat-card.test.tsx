import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from '../stat-card';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total" value="1234" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('renders integer value without decimal span', () => {
    render(<StatCard label="Cnt" value="500" />);
    expect(document.querySelector('.decimal')).not.toBeInTheDocument();
  });

  it('renders decimal part separately', () => {
    render(<StatCard label="Amt" value="1234.56" />);
    expect(document.querySelector('.decimal')).toHaveTextContent('.56');
  });

  it('renders USD currency by default', () => {
    render(<StatCard label="Bal" value="100" />);
    expect(document.querySelector('.currency')).toHaveTextContent('USD');
  });

  it('renders custom currency', () => {
    render(<StatCard label="Bal" value="100" currency="BTC" />);
    expect(document.querySelector('.currency')).toHaveTextContent('BTC');
  });

  it('hides currency when empty string', () => {
    render(<StatCard label="Cnt" value="5" currency="" />);
    expect(document.querySelector('.currency')).not.toBeInTheDocument();
  });

  it('renders delta with up direction', () => {
    render(<StatCard label="Rev" value="100" delta="12.5%" deltaDir="up" />);
    expect(document.querySelector('.stat-delta')).toHaveTextContent('↑ 12.5%');
    expect(document.querySelector('.stat-delta.up')).toBeInTheDocument();
  });

  it('renders delta with down direction', () => {
    render(<StatCard label="Rev" value="100" delta="3.2%" deltaDir="down" />);
    expect(document.querySelector('.stat-delta')).toHaveTextContent('↓ 3.2%');
  });

  it('renders sub text', () => {
    render(<StatCard label="Rev" value="100" sub="last 7d" />);
    expect(screen.getByText('last 7d')).toBeInTheDocument();
  });

  it('does not render stat-foot when no delta or sub', () => {
    render(<StatCard label="Rev" value="100" />);
    expect(document.querySelector('.stat-foot')).not.toBeInTheDocument();
  });

  it('renders icon node', () => {
    render(<StatCard label="Rev" value="100" icon={<span data-testid="icon" />} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <StatCard label="Rev" value="100">
        <span data-testid="child" />
      </StatCard>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders numeric value as string', () => {
    render(<StatCard label="Cnt" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
