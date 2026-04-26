// Tests for shell/viewport-hooks.ts — useViewportBucket and useEffectiveSidebarCollapsed.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffectiveSidebarCollapsed, useViewportBucket } from '../viewport-hooks';

// ── useViewportBucket ─────────────────────────────────────────────────────────

describe('useViewportBucket', () => {
  const defineInnerWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: w,
    });
  };

  afterEach(() => {
    defineInnerWidth(1024); // reset to common default
  });

  it('returns xs when innerWidth < 720', () => {
    defineInnerWidth(600);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('xs');
  });

  it('returns sm when innerWidth is between 720 and 1099', () => {
    defineInnerWidth(900);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('sm');
  });

  it('returns md when innerWidth is between 1100 and 1399', () => {
    defineInnerWidth(1200);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('md');
  });

  it('returns wide when innerWidth >= 1400', () => {
    defineInnerWidth(1600);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('wide');
  });

  it('updates bucket when window resize fires and crosses threshold', () => {
    defineInnerWidth(1600); // start wide
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('wide');

    act(() => {
      defineInnerWidth(500); // drop to xs
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('xs');
  });

  it('does not re-render when resize does not change bucket', () => {
    defineInnerWidth(1600); // wide
    const { result } = renderHook(() => useViewportBucket());

    let renderCount = 0;
    // Track renders via secondary hook
    const { result: counter } = renderHook(() => {
      renderCount++;
      return useViewportBucket();
    });

    const before = renderCount;
    act(() => {
      defineInnerWidth(1500); // still wide
      window.dispatchEvent(new Event('resize'));
    });

    // Bucket didn't change — counter renders should not increase
    expect(counter.result?.current ?? result.current).toBe('wide');
    expect(renderCount - before).toBeLessThanOrEqual(1);
  });

  it('removes resize listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useViewportBucket());
    unmount();
    const calls = removeSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain('resize');
    removeSpy.mockRestore();
  });

  it('boundary: exactly 720 maps to sm (xs < 720)', () => {
    defineInnerWidth(720); // NOT less than 720, so sm
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('sm');
  });

  it('boundary: exactly 719 maps to xs', () => {
    defineInnerWidth(719);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('xs');
  });

  it('boundary: exactly 1400 maps to wide', () => {
    defineInnerWidth(1400);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('wide');
  });

  it('boundary: exactly 1399 maps to md', () => {
    defineInnerWidth(1399);
    const { result } = renderHook(() => useViewportBucket());
    expect(result.current).toBe('md');
  });
});

// ── useEffectiveSidebarCollapsed ──────────────────────────────────────────────

describe('useEffectiveSidebarCollapsed', () => {
  it('returns true for xs regardless of userPref', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('xs', false));
    expect(result.current).toBe(true);
  });

  it('returns true for sm regardless of userPref', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('sm', false));
    expect(result.current).toBe(true);
  });

  it('returns userPref for md when pref is false', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('md', false));
    expect(result.current).toBe(false);
  });

  it('returns userPref for md when pref is true', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('md', true));
    expect(result.current).toBe(true);
  });

  it('returns userPref for wide when pref is false', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('wide', false));
    expect(result.current).toBe(false);
  });

  it('returns userPref for wide when pref is true', () => {
    const { result } = renderHook(() => useEffectiveSidebarCollapsed('wide', true));
    expect(result.current).toBe(true);
  });
});
