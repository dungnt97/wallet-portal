// Tests for components/overlays/modal.tsx — Modal dialog component.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../modal';

vi.mock('@/icons', () => ({
  I: {
    X: () => <span data-testid="icon-x" />,
  },
}));

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Test">
        <div />
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open=true', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="My Dialog">
        <span />
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="My Dialog">
        <span />
      </Modal>
    );
    expect(screen.getByText('My Dialog')).toBeInTheDocument();
  });

  it('renders children inside the body', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="T">
        <div data-testid="modal-child">content</div>
      </Modal>
    );
    expect(screen.getByTestId('modal-child')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="T" footer={<button type="button">OK</button>}>
        <span />
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('does not render footer container when footer is not provided', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="T">
        <span />
      </Modal>
    );
    expect(document.querySelector('.sheet-footer')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open={true} onClose={onClose} title="T">
        <span />
      </Modal>
    );
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when scrim is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open={true} onClose={onClose} title="T">
        <span />
      </Modal>
    );
    const scrim = document.querySelector('.scrim') as HTMLElement;
    await user.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has aria-modal on the dialog element', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="T">
        <span />
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders title as ReactNode', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title={<strong data-testid="rich-title">Bold</strong>}>
        <span />
      </Modal>
    );
    expect(screen.getByTestId('rich-title')).toBeInTheDocument();
  });
});
