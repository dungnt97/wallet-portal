// Tests for use-keyboard-shortcuts.ts — leader-key (g+x) navigation and '?' overlay.
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../use-keyboard-shortcuts';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Dispatch a keydown event from document.body so that e.target is a real
 * HTMLElement with a tagName — document itself has no tagName in jsdom and
 * the handler calls target.tagName.toLowerCase() unconditionally.
 */
function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  document.body.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── useKeyboardShortcuts ──────────────────────────────────────────────────────

describe('useKeyboardShortcuts', () => {
  it('navigates to /app/dashboard on g+d', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('d');
    expect(mockNavigate).toHaveBeenCalledWith('/app/dashboard');
  });

  it('navigates to /app/withdrawals on g+w', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('w');
    expect(mockNavigate).toHaveBeenCalledWith('/app/withdrawals');
  });

  it('navigates to /app/sweep on g+s', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('s');
    expect(mockNavigate).toHaveBeenCalledWith('/app/sweep');
  });

  it('navigates to /app/users on g+u', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('u');
    expect(mockNavigate).toHaveBeenCalledWith('/app/users');
  });

  it('navigates to /app/audit on g+a', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('a');
    expect(mockNavigate).toHaveBeenCalledWith('/app/audit');
  });

  it('navigates to /app/recovery on g+r', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('r');
    expect(mockNavigate).toHaveBeenCalledWith('/app/recovery');
  });

  it('navigates to /app/ops on g+o', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('o');
    expect(mockNavigate).toHaveBeenCalledWith('/app/ops');
  });

  it('navigates to /app/cold on g+c', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('c');
    expect(mockNavigate).toHaveBeenCalledWith('/app/cold');
  });

  it('calls onHelpToggle when ? is pressed', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('?');
    expect(onHelpToggle).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when disabled=true', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle, disabled: true }));
    fireKey('g');
    fireKey('d');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when g is followed by unknown key', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    fireKey('z');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when leader timeout expires before second key', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g');
    vi.advanceTimersByTime(600); // past 500ms LEADER_TIMEOUT_MS
    fireKey('d');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores keys pressed inside an input element', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    // Dispatch from an <input> — bubbles up to document but e.target is the input.
    const input = document.createElement('input');
    document.body.appendChild(input);
    // Dispatch directly from the input so e.target.tagName === 'INPUT'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    document.body.removeChild(input);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores keys with Ctrl modifier', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('g', { ctrlKey: true });
    fireKey('d');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores keys with Meta modifier', () => {
    const onHelpToggle = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    fireKey('k', { metaKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(onHelpToggle).not.toHaveBeenCalled();
  });

  it('removes keydown listener on unmount', () => {
    const onHelpToggle = vi.fn();
    const removeEventSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onHelpToggle }));
    unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventSpy.mockRestore();
  });
});
