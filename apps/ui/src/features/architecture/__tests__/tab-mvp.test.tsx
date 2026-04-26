// Smoke tests for features/architecture/tab-mvp.tsx — MVP phases and non-goals render.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabMvp } from '../tab-mvp';

describe('TabMvp', () => {
  it('renders without crashing', () => {
    render(<TabMvp />);
    expect(screen.getByText('MVP plan')).toBeInTheDocument();
  });

  it('renders Phase 1 card', () => {
    render(<TabMvp />);
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
  });

  it('renders Phase 2 card', () => {
    render(<TabMvp />);
    expect(screen.getByText('Phase 2')).toBeInTheDocument();
  });

  it('renders Phase 3 card', () => {
    render(<TabMvp />);
    expect(screen.getByText('Phase 3')).toBeInTheDocument();
  });

  it('renders BNB phase title', () => {
    render(<TabMvp />);
    expect(screen.getByText('BNB · USDT · single-tenant')).toBeInTheDocument();
  });

  it('renders What NOT to build yet section', () => {
    render(<TabMvp />);
    expect(screen.getByText('What NOT to build yet')).toBeInTheDocument();
  });

  it('renders non-goals list items', () => {
    render(<TabMvp />);
    expect(screen.getByText('Microservices.')).toBeInTheDocument();
    expect(screen.getByText('Auto-sweep.')).toBeInTheDocument();
  });
});
