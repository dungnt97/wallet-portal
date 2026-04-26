// Tests for components/overlays/toast-host.tsx — ToastHost provider and useToast hook.
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastHost, useToast } from '../toast-host';

// ── Mock @/icons — avoid SVG import issues in jsdom ──────────────────────────

vi.mock('@/icons', () => ({
  I: {
    Check: () => <span data-testid="icon-check" />,
    AlertTri: () => <span data-testid="icon-alert-tri" />,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <ToastHost>{children}</ToastHost>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast', () => {
  it('throws when used outside ToastHost', () => {
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used inside <ToastHost>');
  });

  it('returns a function when inside ToastHost', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(typeof result.current).toBe('function');
  });
});

describe('ToastHost', () => {
  it('renders children', () => {
    render(
      <ToastHost>
        <div data-testid="child">hello</div>
      </ToastHost>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders a toast message after push', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Operation successful');
    });
    expect(screen.getByText('Operation successful')).toBeInTheDocument();
  });

  it('shows success icon for success kind', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Saved!', 'success');
    });
    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
  });

  it('shows error icon for error kind', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Failed!', 'error');
    });
    expect(screen.getByTestId('icon-alert-tri')).toBeInTheDocument();
  });

  it('applies the correct CSS class for success kind', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Done', 'success');
    });
    const toastEl = screen.getByText('Done').closest('.toast');
    expect(toastEl?.className).toContain('success');
  });

  it('applies the correct CSS class for error kind', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Oops', 'error');
    });
    const toastEl = screen.getByText('Oops').closest('.toast');
    expect(toastEl?.className).toContain('error');
  });

  it('defaults to default kind when no kind provided', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Info message');
    });
    const toastEl = screen.getByText('Info message').closest('.toast');
    expect(toastEl?.className).toContain('default');
  });

  it('removes toast after 3500ms', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('Temporary message');
    });
    expect(screen.getByText('Temporary message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Temporary message')).not.toBeInTheDocument();
  });

  it('can display multiple toasts simultaneously', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current('First toast', 'success');
      result.current('Second toast', 'error');
    });
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });
});
