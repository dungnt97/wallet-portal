// Unit tests for useTimeLeft hook — tick accuracy, expired state, cleanup.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeLeft } from '../use-time-left';

describe('useTimeLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expired immediately when targetDate is null', () => {
    const { result } = renderHook(() => useTimeLeft(null));
    expect(result.current.expired).toBe(true);
    expect(result.current.days).toBe(0);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(0);
  });

  it('returns expired immediately when targetDate is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { result } = renderHook(() => useTimeLeft(past));
    expect(result.current.expired).toBe(true);
  });

  it('returns correct initial countdown for a future date', () => {
    // 1 hour + 30 minutes + 45 seconds in the future
    const future = new Date(Date.now() + 5445_000).toISOString(); // 5445s = 1h30m45s
    const { result } = renderHook(() => useTimeLeft(future));
    expect(result.current.expired).toBe(false);
    expect(result.current.hours).toBe(1);
    expect(result.current.minutes).toBe(30);
    // seconds may vary by ±1 due to rounding; accept 44 or 45
    expect(result.current.seconds).toBeGreaterThanOrEqual(44);
    expect(result.current.seconds).toBeLessThanOrEqual(45);
  });

  it('ticks down by 1 second each interval', () => {
    const future = new Date(Date.now() + 10_000).toISOString(); // 10s
    const { result } = renderHook(() => useTimeLeft(future));

    const initialSeconds = result.current.seconds;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.seconds).toBe(initialSeconds - 1);
  });

  it('transitions to expired when countdown reaches zero', () => {
    const future = new Date(Date.now() + 2000).toISOString(); // 2s
    const { result } = renderHook(() => useTimeLeft(future));

    expect(result.current.expired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3000); // advance past expiry
    });

    expect(result.current.expired).toBe(true);
  });

  it('clears the interval on unmount (no memory leak)', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const future = new Date(Date.now() + 60_000).toISOString();

    const { unmount } = renderHook(() => useTimeLeft(future));
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('handles 48h timelock correctly', () => {
    const fortyEightHours = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { result } = renderHook(() => useTimeLeft(fortyEightHours));

    expect(result.current.expired).toBe(false);
    expect(result.current.days).toBe(2);
    expect(result.current.hours).toBe(0);
  });

  it('accepts a Date object in addition to ISO string', () => {
    const future = new Date(Date.now() + 5000);
    const { result } = renderHook(() => useTimeLeft(future));
    expect(result.current.expired).toBe(false);
    expect(result.current.seconds).toBeGreaterThan(0);
  });
});
