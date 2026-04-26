// Smoke tests for icons/index.tsx — renders every icon in the I object without throwing.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I } from '../index';

describe('Icon components', () => {
  it('renders every icon with default props', () => {
    for (const [name, IconComp] of Object.entries(I)) {
      const { container } = render(<IconComp />);
      const svg = container.querySelector('svg');
      expect(svg, `${name} should render an svg`).not.toBeNull();
    }
  });

  it('renders icons with custom size', () => {
    const { container } = render(<I.Dashboard size={24} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it('renders icons with custom strokeWidth', () => {
    const { container } = render(<I.Shield stroke={2} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
  });

  it('renders icons with custom fill', () => {
    const { container } = render(<I.Check fill="red" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('red');
  });

  it('renders icons with custom className', () => {
    const { container } = render(<I.Bell className="my-icon" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('my-icon')).toBe(true);
  });
});
