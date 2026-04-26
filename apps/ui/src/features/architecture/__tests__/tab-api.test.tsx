// Smoke tests for features/architecture/tab-api.tsx — API endpoint catalogue render.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabApi } from '../tab-api';

describe('TabApi', () => {
  it('renders without crashing', () => {
    render(<TabApi />);
    expect(screen.getByText('API surface (Admin API)')).toBeInTheDocument();
  });

  it('renders Deposits group heading', () => {
    render(<TabApi />);
    expect(screen.getByText('Deposits')).toBeInTheDocument();
  });

  it('renders Sweeps group heading', () => {
    render(<TabApi />);
    expect(screen.getByText('Sweeps')).toBeInTheDocument();
  });

  it('renders GET method badges', () => {
    render(<TabApi />);
    const getBadges = screen.getAllByText('GET');
    expect(getBadges.length).toBeGreaterThan(0);
  });

  it('renders POST method badges', () => {
    render(<TabApi />);
    const postBadges = screen.getAllByText('POST');
    expect(postBadges.length).toBeGreaterThan(0);
  });

  it('renders /v1/deposits endpoint', () => {
    render(<TabApi />);
    expect(screen.getByText('/v1/deposits')).toBeInTheDocument();
  });
});
