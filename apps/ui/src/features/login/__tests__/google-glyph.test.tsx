// Tests for features/login/google-glyph.tsx — Google G SVG glyph.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleGlyph } from '../google-glyph';

describe('GoogleGlyph', () => {
  it('renders an SVG element', () => {
    const { container } = render(<GoogleGlyph />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses default size of 16 when no size prop given', () => {
    const { container } = render(<GoogleGlyph />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
  });

  it('uses provided size prop', () => {
    const { container } = render(<GoogleGlyph size={32} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('sets aria-hidden on SVG', () => {
    const { container } = render(<GoogleGlyph />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('has viewBox 0 0 48 48', () => {
    const { container } = render(<GoogleGlyph />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 48 48');
  });

  it('contains four colored path elements', () => {
    const { container } = render(<GoogleGlyph />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(4);
  });

  it('includes Google red fill color (#EA4335)', () => {
    const { container } = render(<GoogleGlyph />);
    const redPath = container.querySelector('path[fill="#EA4335"]');
    expect(redPath).toBeInTheDocument();
  });

  it('includes Google blue fill color (#4285F4)', () => {
    const { container } = render(<GoogleGlyph />);
    const bluePath = container.querySelector('path[fill="#4285F4"]');
    expect(bluePath).toBeInTheDocument();
  });

  it('includes Google yellow fill color (#FBBC05)', () => {
    const { container } = render(<GoogleGlyph />);
    const yellowPath = container.querySelector('path[fill="#FBBC05"]');
    expect(yellowPath).toBeInTheDocument();
  });

  it('includes Google green fill color (#34A853)', () => {
    const { container } = render(<GoogleGlyph />);
    const greenPath = container.querySelector('path[fill="#34A853"]');
    expect(greenPath).toBeInTheDocument();
  });
});
