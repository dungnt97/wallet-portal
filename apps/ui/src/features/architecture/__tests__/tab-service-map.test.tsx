// Smoke tests for features/architecture/tab-service-map.tsx — service diagram, component list, non-goals.
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

vi.mock('../service-map-diagram', () => ({
  ServiceMapDiagram: () => <div data-testid="service-map-diagram" />,
}));

import { TabServiceMap } from '../tab-service-map';

describe('TabServiceMap', () => {
  it('renders without crashing', () => {
    render(<TabServiceMap />);
    expect(screen.getByText('Service map')).toBeInTheDocument();
  });

  it('renders service map diagram', () => {
    render(<TabServiceMap />);
    expect(screen.getByTestId('service-map-diagram')).toBeInTheDocument();
  });

  it('renders Components section', () => {
    render(<TabServiceMap />);
    expect(screen.getByText('Components')).toBeInTheDocument();
  });

  it('renders Admin UI component', () => {
    render(<TabServiceMap />);
    expect(screen.getByText('Admin UI')).toBeInTheDocument();
  });

  it('renders Admin API component', () => {
    render(<TabServiceMap />);
    expect(screen.getByText('Admin API (Node)')).toBeInTheDocument();
  });

  it('renders Policy Engine component', () => {
    render(<TabServiceMap />);
    expect(screen.getByText('Policy Engine (Go)')).toBeInTheDocument();
  });

  it('renders non-goals section', () => {
    render(<TabServiceMap />);
    expect(screen.getByText("What we deliberately don't use")).toBeInTheDocument();
  });
});
