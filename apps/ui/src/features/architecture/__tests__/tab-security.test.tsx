// Smoke tests for features/architecture/tab-security.tsx — security controls matrix render.
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

import { TabSecurity } from '../tab-security';

describe('TabSecurity', () => {
  it('renders without crashing', () => {
    render(<TabSecurity />);
    expect(screen.getByText('Security model')).toBeInTheDocument();
  });

  it('renders Key custody control', () => {
    render(<TabSecurity />);
    expect(screen.getByText('Key custody')).toBeInTheDocument();
  });

  it('renders Admin auth control', () => {
    render(<TabSecurity />);
    expect(screen.getByText('Admin auth')).toBeInTheDocument();
  });

  it('renders RBAC matrix control', () => {
    render(<TabSecurity />);
    expect(screen.getByText('RBAC matrix')).toBeInTheDocument();
  });

  it('renders Audit log control', () => {
    render(<TabSecurity />);
    expect(screen.getByText('Audit log')).toBeInTheDocument();
  });

  it('renders failure handling section', () => {
    render(<TabSecurity />);
    expect(screen.getByText('Failure handling')).toBeInTheDocument();
  });

  it('renders RPC failure case', () => {
    render(<TabSecurity />);
    expect(screen.getByText('RPC failure')).toBeInTheDocument();
  });
});
