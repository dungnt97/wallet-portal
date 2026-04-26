// Smoke tests for features/architecture/tab-jobs.tsx — jobs table render.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabJobs } from '../tab-jobs';

describe('TabJobs', () => {
  it('renders without crashing', () => {
    render(<TabJobs />);
    expect(screen.getByText('Background jobs')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<TabJobs />);
    expect(screen.getByText('Job')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Trigger')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders BlockchainWatcher job row', () => {
    render(<TabJobs />);
    expect(screen.getByText('BlockchainWatcher::ScanBlock')).toBeInTheDocument();
  });

  it('renders Deposits::ConfirmJob row', () => {
    render(<TabJobs />);
    expect(screen.getByText('Deposits::ConfirmJob')).toBeInTheDocument();
  });

  it('renders Reconciliation::HourlyJob row', () => {
    render(<TabJobs />);
    expect(screen.getByText('Reconciliation::HourlyJob')).toBeInTheDocument();
  });

  it('renders Node and Admin API owner badges', () => {
    render(<TabJobs />);
    const nodeBadges = screen.getAllByText('Node');
    const apiBadges = screen.getAllByText('Admin API');
    expect(nodeBadges.length).toBeGreaterThan(0);
    expect(apiBadges.length).toBeGreaterThan(0);
  });
});
