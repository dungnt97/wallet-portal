// Tests for step-up-provider.tsx
// Tests: renders children, requestStepUp opens modal, success resolves promise,
// cancel rejects promise, registers/unregisters handler with api client.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockRegister, mockUnregister } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockUnregister: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  registerStepUpHandler: mockRegister,
  unregisterStepUpHandler: mockUnregister,
}));

vi.mock('@/features/auth/step-up-modal', () => ({
  StepUpModal: ({
    onSuccess,
    onCancel,
  }: {
    onSuccess: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="step-up-modal">
      <button type="button" onClick={onSuccess}>
        modal-success
      </button>
      <button type="button" onClick={onCancel}>
        modal-cancel
      </button>
    </div>
  ),
}));

// Import after mocks
import { StepUpProvider, useStepUpContext } from '../step-up-provider';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <StepUpProvider>{children}</StepUpProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepUpProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children without modal by default', () => {
    render(
      <StepUpProvider>
        <div data-testid="child">hello</div>
      </StepUpProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('step-up-modal')).not.toBeInTheDocument();
  });

  it('registers step-up handler on mount', () => {
    render(
      <StepUpProvider>
        <div />
      </StepUpProvider>
    );
    expect(mockRegister).toHaveBeenCalledOnce();
    expect(mockRegister).toHaveBeenCalledWith(expect.any(Function));
  });

  it('unregisters step-up handler on unmount', () => {
    const { unmount } = render(
      <StepUpProvider>
        <div />
      </StepUpProvider>
    );
    unmount();
    expect(mockUnregister).toHaveBeenCalledOnce();
  });
});

describe('useStepUpContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when used outside StepUpProvider', () => {
    // Suppress React error boundary output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => {
      const TestComp = () => {
        useStepUpContext();
        return null;
      };
      render(<TestComp />);
    }).toThrow('useStepUpContext must be used inside <StepUpProvider>');
    spy.mockRestore();
  });

  it('provides requestStepUp function', () => {
    let ctx: ReturnType<typeof useStepUpContext> | null = null;
    const Capture = () => {
      ctx = useStepUpContext();
      return null;
    };
    render(
      <StepUpProvider>
        <Capture />
      </StepUpProvider>
    );
    expect(typeof ctx!.requestStepUp).toBe('function');
  });

  it('opens modal when requestStepUp is called', async () => {
    const Trigger = () => {
      const { requestStepUp } = useStepUpContext();
      return (
        <button type="button" onClick={() => void requestStepUp()}>
          trigger-step-up
        </button>
      );
    };
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger />
      </StepUpProvider>
    );
    await user.click(screen.getByText('trigger-step-up'));
    expect(screen.getByTestId('step-up-modal')).toBeInTheDocument();
  });

  it('resolves requestStepUp promise on modal success', async () => {
    let resolved = false;
    const Trigger = () => {
      const { requestStepUp } = useStepUpContext();
      return (
        <button
          type="button"
          onClick={() =>
            void requestStepUp().then(() => {
              resolved = true;
            })
          }
        >
          trigger-step-up
        </button>
      );
    };
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger />
      </StepUpProvider>
    );
    await user.click(screen.getByText('trigger-step-up'));
    await user.click(screen.getByText('modal-success'));
    await waitFor(() => expect(resolved).toBe(true));
    // Modal should close after success
    expect(screen.queryByTestId('step-up-modal')).not.toBeInTheDocument();
  });

  it('rejects requestStepUp promise on modal cancel', async () => {
    let rejected = false;
    const Trigger = () => {
      const { requestStepUp } = useStepUpContext();
      return (
        <button
          type="button"
          onClick={() =>
            void requestStepUp().catch(() => {
              rejected = true;
            })
          }
        >
          trigger-step-up
        </button>
      );
    };
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger />
      </StepUpProvider>
    );
    await user.click(screen.getByText('trigger-step-up'));
    await user.click(screen.getByText('modal-cancel'));
    await waitFor(() => expect(rejected).toBe(true));
    expect(screen.queryByTestId('step-up-modal')).not.toBeInTheDocument();
  });

  it('reject error message says Step-up cancelled by user', async () => {
    let errorMsg = '';
    const Trigger = () => {
      const { requestStepUp } = useStepUpContext();
      return (
        <button
          type="button"
          onClick={() =>
            void requestStepUp().catch((err: Error) => {
              errorMsg = err.message;
            })
          }
        >
          trigger-step-up
        </button>
      );
    };
    const user = userEvent.setup();
    render(
      <StepUpProvider>
        <Trigger />
      </StepUpProvider>
    );
    await user.click(screen.getByText('trigger-step-up'));
    await user.click(screen.getByText('modal-cancel'));
    await waitFor(() => expect(errorMsg).toBe('Step-up cancelled by user'));
  });

  it('registered handler triggers requestStepUp (opens modal)', async () => {
    render(
      <StepUpProvider>
        <div />
      </StepUpProvider>
    );
    // The registered handler is the first argument to mockRegister
    const handler = mockRegister.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    // Call the registered handler — it should open the modal
    await act(async () => {
      void handler?.();
    });
    expect(screen.getByTestId('step-up-modal')).toBeInTheDocument();
  });
});
