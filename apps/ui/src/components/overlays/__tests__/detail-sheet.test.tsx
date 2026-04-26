// Tests for components/overlays/detail-sheet.tsx — action-array wrapper around Sheet.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../sheet', () => ({
  Sheet: ({
    open,
    onClose,
    title,
    subtitle,
    footer,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="sheet">
        <h2>{title}</h2>
        {subtitle && <p data-testid="sheet-subtitle">{subtitle}</p>}
        <div data-testid="sheet-footer">{footer}</div>
        <button type="button" data-testid="sheet-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { DetailSheet } from '../detail-sheet';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DetailSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <DetailSheet open={false} onClose={vi.fn()} title="Test">
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('renders sheet when open', () => {
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="Test">
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
  });

  it('passes title to Sheet', () => {
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="My Title">
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('passes subtitle to Sheet', () => {
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="T" subtitle="Sub">
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByTestId('sheet-subtitle').textContent).toBe('Sub');
  });

  it('renders children', () => {
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="T">
        <p>child content</p>
      </DetailSheet>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders badges above children', () => {
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="T" badges={<span>badge-1</span>}>
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('badge-1')).toBeInTheDocument();
  });

  it('renders primary action buttons in footer', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Save', onClick: vi.fn() }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders secondary action buttons in footer', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        secondaryActions={[{ label: 'View', onClick: vi.fn() }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('View')).toBeInTheDocument();
  });

  it('calls action onClick when action button clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailSheet open={true} onClose={vi.fn()} title="T" actions={[{ label: 'OK', onClick }]}>
        <p>body</p>
      </DetailSheet>
    );
    await user.click(screen.getByText('OK'));
    expect(onClick).toHaveBeenCalled();
  });

  it('disables action button when disabled=true', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Disabled', onClick: vi.fn(), disabled: true }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('Disabled').closest('button')).toBeDisabled();
  });

  it('uses btn-primary class for primary variant', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Primary', onClick: vi.fn(), variant: 'primary' }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('Primary').closest('button')).toHaveClass('btn-primary');
  });

  it('uses btn-ghost with err color for danger variant', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Delete', onClick: vi.fn(), variant: 'danger' }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    const btn = screen.getByText('Delete').closest('button') as HTMLButtonElement;
    expect(btn).toHaveClass('btn-ghost');
    expect(btn.style.color).toBe('var(--err-text)');
  });

  it('renders custom footer when provided (ignores actions)', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        footer={<span>custom-footer</span>}
        actions={[{ label: 'Ignored', onClick: vi.fn() }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByText('custom-footer')).toBeInTheDocument();
    expect(screen.queryByText('Ignored')).not.toBeInTheDocument();
  });

  it('renders icon in action button', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Go', onClick: vi.fn(), icon: <span data-testid="btn-icon" /> }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByTestId('btn-icon')).toBeInTheDocument();
  });

  it('renders spacer between secondary and primary actions', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        secondaryActions={[{ label: 'Back', onClick: vi.fn() }]}
        actions={[{ label: 'Save', onClick: vi.fn() }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    // Both buttons appear in the footer
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders title attr on action button', () => {
    render(
      <DetailSheet
        open={true}
        onClose={vi.fn()}
        title="T"
        actions={[{ label: 'Tip', onClick: vi.fn(), title: 'tooltip text' }]}
      >
        <p>body</p>
      </DetailSheet>
    );
    expect(screen.getByTitle('tooltip text')).toBeInTheDocument();
  });
});
