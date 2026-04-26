// Tests for helpers.ts — shortAddr, minutesAgo, explorerUrl, addressExplorerUrl, downloadCSV
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressExplorerUrl, downloadCSV, explorerUrl, minutesAgo, shortAddr } from '../helpers';

// ── shortAddr ─────────────────────────────────────────────────────────────────

describe('shortAddr', () => {
  it('truncates a long address with default a=6, b=4', () => {
    // 0x1234567890abcdef1234 → slice(0,6)="0x1234", slice(-4)="1234"
    const addr = '0x1234567890abcdef1234';
    const result = shortAddr(addr);
    expect(result).toBe('0x1234…1234');
  });

  it('returns the original string when it is short enough', () => {
    const short = '0x1234';
    expect(shortAddr(short)).toBe('0x1234');
  });

  it('returns empty string when given empty string', () => {
    expect(shortAddr('')).toBe('');
  });

  it('respects custom a and b params', () => {
    const addr = '0xABCDEFGHIJKLMNOP';
    const result = shortAddr(addr, 4, 4);
    expect(result.startsWith('0xAB')).toBe(true);
    expect(result.endsWith('MNOP')).toBe(true);
    expect(result).toContain('…');
  });

  it('does not truncate string equal to a+b+3', () => {
    // Exactly a+b+3 = 6+4+3 = 13 chars should NOT be truncated
    const addr = '0123456789012'; // 13 chars
    expect(shortAddr(addr)).toBe(addr);
  });
});

// ── minutesAgo ────────────────────────────────────────────────────────────────

describe('minutesAgo', () => {
  it('returns an ISO string', () => {
    const result = minutesAgo(5);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns a date roughly 5 minutes in the past', () => {
    const now = Date.now();
    const result = new Date(minutesAgo(5)).getTime();
    const diff = now - result;
    // Allow ±100ms tolerance
    expect(diff).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100);
    expect(diff).toBeLessThanOrEqual(5 * 60 * 1000 + 100);
  });

  it('returns a date roughly 60 minutes in the past for m=60', () => {
    const now = Date.now();
    const result = new Date(minutesAgo(60)).getTime();
    const diff = now - result;
    expect(diff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 100);
    expect(diff).toBeLessThanOrEqual(60 * 60 * 1000 + 100);
  });
});

// ── explorerUrl ───────────────────────────────────────────────────────────────

describe('explorerUrl', () => {
  it('returns bscscan URL for bnb chain', () => {
    const url = explorerUrl('bnb', '0xabc123');
    expect(url).toBe('https://bscscan.com/tx/0xabc123');
  });

  it('returns solscan URL for sol chain', () => {
    const url = explorerUrl('sol', 'sig123abc');
    expect(url).toBe('https://solscan.io/tx/sig123abc');
  });
});

// ── addressExplorerUrl ────────────────────────────────────────────────────────

describe('addressExplorerUrl', () => {
  it('returns bscscan address URL for bnb chain', () => {
    const url = addressExplorerUrl('bnb', '0xWallet');
    expect(url).toBe('https://bscscan.com/address/0xWallet');
  });

  it('returns solscan account URL for sol chain', () => {
    const url = addressExplorerUrl('sol', 'SolWallet123');
    expect(url).toBe('https://solscan.io/account/SolWallet123');
  });
});

// ── downloadCSV ───────────────────────────────────────────────────────────────
// jsdom does not implement URL.createObjectURL, so we stub it globally.

describe('downloadCSV', () => {
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAnchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'a' ? (mockAnchor as unknown as HTMLElement) : document.createElement(tag)
    );
    // jsdom does not implement URL.createObjectURL — stub both methods
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers a click on the anchor element', () => {
    downloadCSV('test.csv', [['row1col1', 'row1col2']], ['col1', 'col2']);
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('sets the download filename', () => {
    downloadCSV('export.csv', [], ['h1', 'h2']);
    expect(mockAnchor.download).toBe('export.csv');
  });

  it('creates object URL from a blob', () => {
    downloadCSV('data.csv', [['a', 'b']], ['x', 'y']);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('revokes the object URL after click', () => {
    downloadCSV('data.csv', [['a']], ['h']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('escapes values containing commas by wrapping in quotes', () => {
    let capturedContent = '';
    const origBlob = globalThis.Blob;
    globalThis.Blob = class extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        capturedContent = (parts as string[])[0];
      }
    } as typeof Blob;
    downloadCSV('test.csv', [['hello, world']], ['col']);
    expect(capturedContent).toContain('"hello, world"');
    globalThis.Blob = origBlob;
  });

  it('escapes values containing double quotes', () => {
    let capturedContent = '';
    const origBlob = globalThis.Blob;
    globalThis.Blob = class extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        capturedContent = (parts as string[])[0];
      }
    } as typeof Blob;
    downloadCSV('test.csv', [['say "hi"']], ['col']);
    expect(capturedContent).toContain('"say ""hi"""');
    globalThis.Blob = origBlob;
  });

  it('renders null and undefined as empty strings in CSV', () => {
    let capturedContent = '';
    const origBlob = globalThis.Blob;
    globalThis.Blob = class extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        capturedContent = (parts as string[])[0];
      }
    } as typeof Blob;
    downloadCSV('test.csv', [[null, undefined]], ['a', 'b']);
    const rows = capturedContent.split('\n');
    expect(rows[1]).toBe(',');
    globalThis.Blob = origBlob;
  });
});
