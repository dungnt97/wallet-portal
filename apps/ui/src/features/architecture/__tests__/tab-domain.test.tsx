// Smoke tests for features/architecture/tab-domain.tsx — domain model entities and ledger invariants.
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

import { TabDomain } from '../tab-domain';

describe('TabDomain', () => {
  it('renders without crashing', () => {
    render(<TabDomain />);
    expect(screen.getByText('Domain model')).toBeInTheDocument();
  });

  it('renders User entity card', () => {
    render(<TabDomain />);
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('renders Deposit entity card', () => {
    render(<TabDomain />);
    expect(screen.getByText('Deposit')).toBeInTheDocument();
  });

  it('renders LedgerEntry entity card', () => {
    render(<TabDomain />);
    expect(screen.getByText('LedgerEntry')).toBeInTheDocument();
  });

  it('renders MultisigOperation entity card', () => {
    render(<TabDomain />);
    expect(screen.getByText('MultisigOperation')).toBeInTheDocument();
  });

  it('renders Ledger invariants section', () => {
    render(<TabDomain />);
    expect(screen.getByText('Ledger invariants')).toBeInTheDocument();
  });

  it('renders AuditLog entity card', () => {
    render(<TabDomain />);
    expect(screen.getByText('AuditLog')).toBeInTheDocument();
  });
});
