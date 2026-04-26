// Tests for csv-export-trigger.ts — triggerCsvDownload DOM anchor click.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerCsvDownload } from '../csv-export-trigger';

describe('triggerCsvDownload', () => {
  let mockAnchor: {
    href: string;
    style: { display: string };
    click: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAnchor = { href: '', style: { display: '' }, click: vi.fn() };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'a' ? (mockAnchor as unknown as HTMLElement) : document.createElement(tag)
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets href to the provided URL', () => {
    triggerCsvDownload('/api/deposits/export.csv?chain=bnb');
    expect(mockAnchor.href).toBe('/api/deposits/export.csv?chain=bnb');
  });

  it('sets anchor display to none', () => {
    triggerCsvDownload('/api/export.csv');
    expect(mockAnchor.style.display).toBe('none');
  });

  it('appends the anchor to document.body', () => {
    triggerCsvDownload('/api/export.csv');
    expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
  });

  it('clicks the anchor element', () => {
    triggerCsvDownload('/api/export.csv');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('removes the anchor from document.body after click', () => {
    triggerCsvDownload('/api/export.csv');
    expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
  });

  it('is a no-op when document is undefined (SSR guard)', () => {
    // Temporarily hide document to simulate SSR environment
    const origDocument = globalThis.document;
    // biome-ignore lint/suspicious/noExplicitAny: SSR simulation — assigning undefined to document
    (globalThis as any).document = undefined;
    expect(() => triggerCsvDownload('/api/export.csv')).not.toThrow();
    globalThis.document = origDocument;
  });
});
