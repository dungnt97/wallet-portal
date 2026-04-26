// Smoke tests for features/architecture/tab-sequence.tsx — sequence diagram switcher.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../sequence-diagram', () => ({
  SequenceDiagram: ({ sequence }: { sequence: { id: string; title: string } }) => (
    <div data-testid={`sequence-diagram-${sequence.id}`}>{sequence.title}</div>
  ),
}));

import { TabSequence } from '../tab-sequence';

describe('TabSequence', () => {
  it('renders without crashing', () => {
    render(<TabSequence />);
    expect(screen.getByText('Sequence diagrams')).toBeInTheDocument();
  });

  it('shows first sequence (deposit) by default', () => {
    render(<TabSequence />);
    expect(screen.getByTestId('sequence-diagram-deposit')).toBeInTheDocument();
  });

  it('renders sequence switcher buttons', () => {
    render(<TabSequence />);
    // Button text + diagram title both render; getAllByText accepts multiple matches
    expect(screen.getAllByText('Deposit detection & crediting').length).toBeGreaterThan(0);
    expect(screen.getByText('Withdrawal with 2-of-3 multisig')).toBeInTheDocument();
  });

  it('switches to withdrawal sequence on click', async () => {
    const user = userEvent.setup();
    render(<TabSequence />);
    await user.click(screen.getByText('Withdrawal with 2-of-3 multisig'));
    expect(screen.getByTestId('sequence-diagram-withdrawal')).toBeInTheDocument();
    expect(screen.queryByTestId('sequence-diagram-deposit')).not.toBeInTheDocument();
  });

  it('renders legend items', () => {
    render(<TabSequence />);
    expect(screen.getByText('sync call')).toBeInTheDocument();
    expect(screen.getByText('async / event')).toBeInTheDocument();
  });
});
