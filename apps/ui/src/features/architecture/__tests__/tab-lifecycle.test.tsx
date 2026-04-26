// Smoke tests for features/architecture/tab-lifecycle.tsx — deposit, sweep, withdrawal step lists.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size }: { size?: number }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

import { TabLifecycle } from '../tab-lifecycle';

describe('TabLifecycle', () => {
  it('renders without crashing', () => {
    render(<TabLifecycle />);
    expect(screen.getByText('Deposit lifecycle')).toBeInTheDocument();
  });

  it('renders deposit steps section', () => {
    render(<TabLifecycle />);
    expect(screen.getByText('Address assigned')).toBeInTheDocument();
    expect(screen.getByText('Block scanned')).toBeInTheDocument();
    expect(screen.getByText('Ledger credited')).toBeInTheDocument();
  });

  it('renders sweep lifecycle section', () => {
    render(<TabLifecycle />);
    expect(screen.getByText('Sweep lifecycle (admin-driven)')).toBeInTheDocument();
  });

  it('renders sweep steps', () => {
    render(<TabLifecycle />);
    expect(screen.getByText('Admin selects deposits')).toBeInTheDocument();
  });

  it('renders withdrawal lifecycle section', () => {
    render(<TabLifecycle />);
    expect(screen.getByText('Withdrawal + multisig lifecycle')).toBeInTheDocument();
  });
});
