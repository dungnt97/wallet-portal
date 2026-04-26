import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditKpiStrip } from '../audit-kpi-strip';

vi.mock('@/components/custody', () => ({
  KpiStrip: ({ items }: { items: { key: string; value: unknown }[] }) => (
    <div data-testid="kpi-strip">
      {items.map((item) => (
        <div key={item.key} data-testid={`kpi-${item.key}`}>
          {String(item.value)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/icons', () => ({
  I: {
    Logs: () => <span />,
    Shield: () => <span />,
    Database: () => <span />,
  },
}));

describe('AuditKpiStrip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders KPI strip', () => {
    render(<AuditKpiStrip total={100} />);
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('renders all 4 KPI items', () => {
    render(<AuditKpiStrip total={100} />);
    expect(screen.getByTestId('kpi-events')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-chain')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-retention')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-logins')).toBeInTheDocument();
  });

  it('shows total event count', () => {
    render(<AuditKpiStrip total={500} />);
    expect(screen.getByTestId('kpi-events')).toHaveTextContent('500');
  });

  it('shows loading indicator when isLoading=true', () => {
    render(<AuditKpiStrip total={0} isLoading={true} />);
    expect(screen.getByTestId('kpi-events')).toHaveTextContent('…');
  });

  it('shows login count when provided', () => {
    render(<AuditKpiStrip total={100} loginCount={42} />);
    expect(screen.getByTestId('kpi-logins')).toHaveTextContent('42');
  });

  it('shows loading indicator when loginCount is null', () => {
    render(<AuditKpiStrip total={100} loginCount={null} />);
    expect(screen.getByTestId('kpi-logins')).toHaveTextContent('…');
  });

  it('shows loading indicator when loginCount is undefined', () => {
    render(<AuditKpiStrip total={100} />);
    expect(screen.getByTestId('kpi-logins')).toHaveTextContent('…');
  });

  it('shows SHA-256 for chain integrity', () => {
    render(<AuditKpiStrip total={100} />);
    expect(screen.getByTestId('kpi-chain')).toHaveTextContent('SHA-256');
  });

  it('shows 7 yrs retention', () => {
    render(<AuditKpiStrip total={100} />);
    expect(screen.getByTestId('kpi-retention')).toHaveTextContent('7 yrs');
  });

  it('shows 0 total correctly', () => {
    render(<AuditKpiStrip total={0} isLoading={false} />);
    expect(screen.getByTestId('kpi-events')).toHaveTextContent('0');
  });
});
