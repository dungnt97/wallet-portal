import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '../sheet';

vi.mock('@/icons', () => ({
  I: { X: () => <span data-testid="icon-x" /> },
}));

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={vi.fn()} title="Test" />);
    expect(document.querySelector('.sheet')).not.toBeInTheDocument();
  });

  it('renders sheet when open', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="Test Title" />);
    expect(document.querySelector('.sheet')).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="My Sheet" />);
    expect(screen.getByText('My Sheet')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" subtitle="Sub text" />);
    expect(screen.getByText('Sub text')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" />);
    expect(document.querySelector('.sheet-subtitle')).not.toBeInTheDocument();
  });

  it('renders children in sheet-body', () => {
    render(
      <Sheet open={true} onClose={vi.fn()} title="T">
        <span data-testid="child" />
      </Sheet>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(
      <Sheet open={true} onClose={vi.fn()} title="T" footer={<button type="button">Save</button>} />
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(document.querySelector('.sheet-footer')).toBeInTheDocument();
  });

  it('does not render footer when omitted', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" />);
    expect(document.querySelector('.sheet-footer')).not.toBeInTheDocument();
  });

  it('applies wide class when wide=true', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" wide={true} />);
    expect(document.querySelector('.sheet.wide')).toBeInTheDocument();
  });

  it('does not apply wide class when wide=false', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" wide={false} />);
    expect(document.querySelector('.sheet.wide')).not.toBeInTheDocument();
  });

  it('renders scrim overlay', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" />);
    expect(document.querySelector('.scrim')).toBeInTheDocument();
  });

  it('calls onClose when scrim clicked', () => {
    const onClose = vi.fn();
    render(<Sheet open={true} onClose={onClose} title="T" />);
    fireEvent.click(document.querySelector('.scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<Sheet open={true} onClose={onClose} title="T" />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders close icon button', () => {
    render(<Sheet open={true} onClose={vi.fn()} title="T" />);
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
  });
});
