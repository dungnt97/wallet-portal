import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../status-badge';

describe('StatusBadge', () => {
  it('renders confirmed with ok class', () => {
    render(<StatusBadge status="confirmed" />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(document.querySelector('.badge.ok')).toBeInTheDocument();
  });

  it('renders credited with ok class', () => {
    render(<StatusBadge status="credited" />);
    expect(screen.getByText('Credited')).toBeInTheDocument();
  });

  it('renders swept with info class', () => {
    render(<StatusBadge status="swept" />);
    expect(screen.getByText('Swept')).toBeInTheDocument();
    expect(document.querySelector('.badge.info')).toBeInTheDocument();
  });

  it('renders pending with warn class', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(document.querySelector('.badge.warn')).toBeInTheDocument();
  });

  it('renders failed with err class', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(document.querySelector('.badge.err')).toBeInTheDocument();
  });

  it('renders completed with ok class', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders executing with info class', () => {
    render(<StatusBadge status="executing" />);
    expect(screen.getByText('Executing')).toBeInTheDocument();
  });

  it('renders awaiting_signatures', () => {
    render(<StatusBadge status="awaiting_signatures" />);
    expect(screen.getByText('Awaiting sigs')).toBeInTheDocument();
  });

  it('renders draft with muted class', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(document.querySelector('.badge.muted')).toBeInTheDocument();
  });

  it('renders collecting with warn class', () => {
    render(<StatusBadge status="collecting" />);
    expect(screen.getByText('Collecting')).toBeInTheDocument();
  });

  it('renders ready label', () => {
    render(<StatusBadge status="ready" />);
    expect(screen.getByText('Ready to execute')).toBeInTheDocument();
  });

  it('renders unknown status as raw value with muted class', () => {
    render(<StatusBadge status="custom_status" />);
    expect(screen.getByText('custom_status')).toBeInTheDocument();
    expect(document.querySelector('.badge.muted')).toBeInTheDocument();
  });

  it('renders a dot element inside badge', () => {
    render(<StatusBadge status="confirmed" />);
    expect(document.querySelector('.badge .dot')).toBeInTheDocument();
  });
});
