// use-keyboard-shortcuts — Gmail-style g+key navigation shortcuts.
// Leader key: 'g' — then a second key within LEADER_TIMEOUT_MS.
// Also handles '?' to toggle the help overlay.
//
// Bindings:
//   g d → /app/dashboard
//   g w → /app/withdrawals
//   g s → /app/sweep
//   g c → /app/cold
//   g u → /app/users
//   g a → /app/audit
//   g r → /app/recovery
//   g o → /app/ops
//   ?   → toggle help overlay
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/** Milliseconds to wait for second key after leader 'g' */
const LEADER_TIMEOUT_MS = 500;

export type ShortcutKey = 'd' | 'w' | 's' | 'c' | 'u' | 'a' | 'r' | 'o';

const KEY_TO_ROUTE: Record<ShortcutKey, string> = {
  d: '/app/dashboard',
  w: '/app/withdrawals',
  s: '/app/sweep',
  c: '/app/cold',
  u: '/app/users',
  a: '/app/audit',
  r: '/app/recovery',
  o: '/app/ops',
};

interface Options {
  onHelpToggle: () => void;
  /** Optional override — set true to disable shortcuts (e.g. when a modal is open) */
  disabled?: boolean;
}

/**
 * Registers document-level keydown listeners for g+key navigation.
 * Safe to mount once in AppLayout — cleans up on unmount.
 */
export function useKeyboardShortcuts({ onHelpToggle, disabled }: Options): void {
  const navigate = useNavigate();
  const awaitingSecondKey = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearLeader = () => {
      awaitingSecondKey.current = false;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      // Ignore when focus is inside an input, textarea, select, or contenteditable
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target.isContentEditable) return;

      // Ignore modified keys (Ctrl+K handled separately in app-layout)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // '?' → toggle help overlay
      if (key === '?') {
        e.preventDefault();
        onHelpToggle();
        clearLeader();
        return;
      }

      // Leader key 'g' pressed — arm the second-key window
      if (!awaitingSecondKey.current && key === 'g') {
        e.preventDefault();
        awaitingSecondKey.current = true;
        timeoutRef.current = setTimeout(clearLeader, LEADER_TIMEOUT_MS);
        return;
      }

      // Second key after leader
      if (awaitingSecondKey.current) {
        clearLeader();
        const route = KEY_TO_ROUTE[key as ShortcutKey];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearLeader();
    };
  }, [navigate, onHelpToggle, disabled]);
}
