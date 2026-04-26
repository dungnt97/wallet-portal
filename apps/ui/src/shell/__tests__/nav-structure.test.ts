// Tests for nav-structure.ts — NAV constant shape and pageTitleKey helper.
import { describe, expect, it } from 'vitest';
import { NAV, pageTitleKey } from '../nav-structure';

describe('NAV structure', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(NAV)).toBe(true);
    expect(NAV.length).toBeGreaterThan(0);
  });

  it('every group has a section string', () => {
    for (const group of NAV) {
      expect(typeof group.section).toBe('string');
      expect(group.section.length).toBeGreaterThan(0);
    }
  });

  it('every group has a non-empty items array', () => {
    for (const group of NAV) {
      expect(Array.isArray(group.items)).toBe(true);
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('every nav item has required fields: id, to, labelKey, iconKey', () => {
    for (const group of NAV) {
      for (const item of group.items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.to).toBe('string');
        expect(typeof item.labelKey).toBe('string');
        expect(typeof item.iconKey).toBe('string');
      }
    }
  });

  it('all item.to paths start with /app/', () => {
    for (const group of NAV) {
      for (const item of group.items) {
        expect(item.to.startsWith('/app/')).toBe(true);
      }
    }
  });

  it('all item ids are unique across groups', () => {
    const ids = NAV.flatMap((g) => g.items.map((i) => i.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('contains dashboard item', () => {
    const all = NAV.flatMap((g) => g.items);
    expect(all.some((i) => i.id === 'dashboard')).toBe(true);
  });

  it('contains deposits item', () => {
    const all = NAV.flatMap((g) => g.items);
    expect(all.some((i) => i.id === 'deposits')).toBe(true);
  });

  it('contains withdrawals item', () => {
    const all = NAV.flatMap((g) => g.items);
    expect(all.some((i) => i.id === 'withdrawals')).toBe(true);
  });

  it('contains users item', () => {
    const all = NAV.flatMap((g) => g.items);
    expect(all.some((i) => i.id === 'users')).toBe(true);
  });

  it('badgeKind when present is "warn" or "err"', () => {
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.badgeKind !== undefined) {
          expect(['warn', 'err']).toContain(item.badgeKind);
        }
      }
    }
  });

  it('has section "overview"', () => {
    expect(NAV.some((g) => g.section === 'overview')).toBe(true);
  });

  it('has section "flows"', () => {
    expect(NAV.some((g) => g.section === 'flows')).toBe(true);
  });

  it('has section "admin"', () => {
    expect(NAV.some((g) => g.section === 'admin')).toBe(true);
  });
});

describe('pageTitleKey', () => {
  it('prefixes segment with pageTitles.', () => {
    expect(pageTitleKey('dashboard')).toBe('pageTitles.dashboard');
  });

  it('works for arbitrary segments', () => {
    expect(pageTitleKey('users')).toBe('pageTitles.users');
    expect(pageTitleKey('deposits')).toBe('pageTitles.deposits');
  });

  it('returns a non-empty string for empty segment', () => {
    expect(pageTitleKey('')).toBe('pageTitles.');
  });
});
