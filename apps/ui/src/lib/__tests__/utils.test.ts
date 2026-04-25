import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

describe('cn utility', () => {
  it('merges simple class names', () => {
    const result = cn('px-2', 'py-1');
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
  });

  it('handles undefined and null values', () => {
    const result = cn('px-2', undefined, null, 'py-1');
    expect(result).toContain('px-2');
    expect(result).toContain('py-1');
  });

  it('resolves tailwind conflicts (last class wins)', () => {
    // twMerge resolves conflicts — padding-x should use px-4 not px-2
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toContain('px-4');
    expect(result).not.toContain('px-2');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toContain('base-class');
    expect(result).toContain('active-class');
  });

  it('handles empty input', () => {
    const result = cn('');
    expect(typeof result).toBe('string');
  });

  it('combines multiple conflicting tailwind utilities', () => {
    const result = cn('bg-red-500', 'text-white', 'bg-blue-500');
    expect(result).toContain('bg-blue-500');
    expect(result).toContain('text-white');
    expect(result).not.toContain('bg-red-500');
  });
});
