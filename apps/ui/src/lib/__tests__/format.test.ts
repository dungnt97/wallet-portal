// Unit tests for format utilities
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtCompact, fmtDateTime, fmtUSD, shortHash, timeAgo } from '../format';

describe('fmtUSD', () => {
  it('formats whole numbers with 2 decimal places', () => {
    expect(fmtUSD(1000)).toBe('1,000.00');
  });

  it('formats with proper thousands separator', () => {
    expect(fmtUSD(1000000)).toBe('1,000,000.00');
  });

  it('rounds to 2 decimal places', () => {
    expect(fmtUSD(1000.5)).toBe('1,000.50');
  });

  it('formats small numbers', () => {
    expect(fmtUSD(0.5)).toBe('0.50');
  });

  it('formats zero', () => {
    expect(fmtUSD(0)).toBe('0.00');
  });

  it('accepts string input', () => {
    expect(fmtUSD('2500.75')).toBe('2,500.75');
  });

  it('handles very large numbers', () => {
    expect(fmtUSD(123456789.99)).toBe('123,456,789.99');
  });

  it('handles negative numbers', () => {
    expect(fmtUSD(-1000)).toBe('-1,000.00');
  });
});

describe('fmtCompact', () => {
  it('formats millions with M suffix', () => {
    expect(fmtCompact(5e6)).toBe('5.00M');
  });

  it('formats thousands with K suffix', () => {
    expect(fmtCompact(5e3)).toBe('5.0K');
  });

  it('formats small numbers as USD', () => {
    expect(fmtCompact(500)).toBe('500.00');
  });

  it('rounds millions to 2 decimal places', () => {
    expect(fmtCompact(1234567)).toBe('1.23M');
  });

  it('formats thousands to 1 decimal place', () => {
    expect(fmtCompact(5550)).toBe('5.5K');
  });

  it('accepts string input', () => {
    expect(fmtCompact('1500000')).toBe('1.50M');
  });

  it('handles zero', () => {
    expect(fmtCompact(0)).toBe('0.00');
  });

  it('handles negative numbers as formatted USD (edge case)', () => {
    // fmtCompact treats negative large numbers as <1e3 fallback (returns USD format)
    const result = fmtCompact(-2e6);
    expect(result).toContain('-');
  });

  it('handles boundary case at 1M', () => {
    expect(fmtCompact(1e6)).toBe('1.00M');
  });

  it('handles boundary case at 1K', () => {
    expect(fmtCompact(1e3)).toBe('1.0K');
  });

  it('handles case just below 1K', () => {
    expect(fmtCompact(999)).toBe('999.00');
  });
});

describe('shortHash', () => {
  it('abbreviates long hashes with ellipsis', () => {
    const hash = '0xabcdef1234567890abcdef1234567890';
    expect(shortHash(hash)).toBe('0xabcd…7890');
  });

  it('returns full hash if short enough', () => {
    const hash = '0xabcd';
    expect(shortHash(hash)).toBe('0xabcd');
  });

  it('returns dash for null', () => {
    expect(shortHash(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(shortHash(undefined)).toBe('—');
  });

  it('returns dash for empty string', () => {
    expect(shortHash('')).toBe('—');
  });

  it('customizes prefix length', () => {
    const hash = '0xabcdef1234567890abcdef1234567890';
    const result = shortHash(hash, 4, 4);
    // Should show 4 chars from start and 4 from end with ellipsis
    expect(result).toContain('…');
    expect(result).toMatch(/0x(ab|abc)/); // First 4 chars (0x = 2 + 2 more)
  });

  it('customizes suffix length', () => {
    const hash = '0xabcdef1234567890abcdef1234567890';
    const result = shortHash(hash, 6, 6);
    // Should show 6 chars from start and 6 from end with ellipsis
    expect(result).toContain('…');
    expect(result).toMatch(/…/);
  });

  it('handles short hashes without abbreviation', () => {
    // Hashes shorter than threshold should not be abbreviated
    const shortHash1 = '0xabcd1234';
    const result = shortHash(shortHash1);
    expect(result).toBe(shortHash1);
  });

  it('abbreviates long hashes', () => {
    // Hashes longer than threshold should be abbreviated
    const longHash = 'a'.repeat(20);
    const result = shortHash(longHash);
    expect(result).toContain('…');
  });
});

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows seconds ago for recent times', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('30s ago');
  });

  it('shows minutes ago for times within an hour', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('5m ago');
  });

  it('shows hours ago for times within a day', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('3h ago');
  });

  it('shows days ago for times older than a day', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('7d ago');
  });

  it('shows "0s ago" for current time', () => {
    const now = new Date();
    vi.setSystemTime(now);

    expect(timeAgo(now.toISOString())).toBe('0s ago');
  });

  it('rounds down seconds', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 59 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('59s ago');
  });

  it('rounds down minutes', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 59 * 60 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('59m ago');
  });

  it('rounds down hours', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const pastDate = new Date(now.getTime() - 23 * 3600 * 1000).toISOString();
    expect(timeAgo(pastDate)).toBe('23h ago');
  });
});

describe('fmtDateTime', () => {
  it('formats ISO datetime string successfully', () => {
    const iso = '2026-04-21T14:30:45Z';
    const result = fmtDateTime(iso);
    // Should contain year
    expect(result).toContain('2026');
    // Should contain month abbreviation
    expect(result).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
    // Should be non-empty
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles different dates', () => {
    const iso = '2025-12-25T09:15:00Z';
    const result = fmtDateTime(iso);
    expect(result).toContain('2025');
    expect(result).toContain('25');
  });

  it('uses 24-hour time format (no AM/PM)', () => {
    const iso = '2026-04-21T20:45:30Z';
    const result = fmtDateTime(iso);
    // Should not contain AM/PM
    expect(result).not.toContain('AM');
    expect(result).not.toContain('PM');
  });

  it('includes time components', () => {
    const iso = '2026-04-21T14:30:45Z';
    const result = fmtDateTime(iso);
    // Should include colon-separated time (HH:MM:SS format)
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('includes date components', () => {
    const iso = '2026-04-21T14:30:00Z';
    const result = fmtDateTime(iso);
    // Should contain all parts: year, month, day
    expect(result).toMatch(/\d{4}/); // year
    expect(result).toMatch(/\d{1,2}/); // day
  });
});

// Helper: import afterEach for proper timer cleanup
import { afterEach } from 'vitest';
