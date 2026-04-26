// Tests for features/_shared/charts.tsx — Sparkline + AreaChart SVG components.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AreaChart, Sparkline } from '../charts';

// ── Sparkline tests ───────────────────────────────────────────────────────────

describe('Sparkline', () => {
  it('renders null when data has fewer than 2 points', () => {
    const { container } = render(<Sparkline data={[5]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when data is empty', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders SVG with 2+ data points', () => {
    const { container } = render(<Sparkline data={[10, 20, 15]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with sparkline class', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    expect(container.querySelector('svg.sparkline')).toBeInTheDocument();
  });

  it('uses default width=120 and height=32', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 120 32');
  });

  it('uses custom width and height', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} width={200} height={64} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 64');
  });

  it('renders fill area path when fill=true (default)', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2); // area + line
  });

  it('renders only line path when fill=false', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} fill={false} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(1);
  });

  it('uses custom stroke color', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} stroke="#ff0000" />);
    const linePath = container.querySelectorAll('path')[1] as SVGPathElement;
    expect(linePath.getAttribute('stroke')).toBe('#ff0000');
  });

  it('uses custom strokeWidth', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} strokeWidth={3} />);
    const linePath = container.querySelectorAll('path')[1] as SVGPathElement;
    expect(linePath.getAttribute('stroke-width')).toBe('3');
  });

  it('handles flat data (all same values) without NaN', () => {
    const { container } = render(<Sparkline data={[5, 5, 5, 5]} />);
    const paths = container.querySelectorAll('path');
    // Should render without errors and path d should not contain NaN
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toContain('NaN');
    }
  });

  it('handles two-point dataset', () => {
    const { container } = render(<Sparkline data={[0, 100]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

// ── AreaChart tests ───────────────────────────────────────────────────────────

describe('AreaChart', () => {
  it('renders null when data has fewer than 2 points', () => {
    const { container } = render(<AreaChart data={[5]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when data is empty', () => {
    const { container } = render(<AreaChart data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders SVG with 2+ data points', () => {
    const { container } = render(<AreaChart data={[10, 20, 15]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses default dimensions', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 480 120');
  });

  it('uses custom stroke color', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} stroke="#00ff00" />);
    const linePath = container.querySelectorAll('path').item(1) as SVGPathElement;
    expect(linePath.getAttribute('stroke')).toBe('#00ff00');
  });

  it('renders 3 grid lines', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(3);
  });

  it('renders linearGradient defs', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} label="test" />);
    expect(container.querySelector('linearGradient')).toBeInTheDocument();
  });

  it('uses label in gradient id when provided', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} label="revenue" />);
    const gradient = container.querySelector('linearGradient') as SVGLinearGradientElement;
    expect(gradient.getAttribute('id')).toContain('revenue');
  });

  it('renders area + line paths', () => {
    const { container } = render(<AreaChart data={[1, 2, 3]} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
  });

  it('handles flat data without NaN in path', () => {
    const { container } = render(<AreaChart data={[10, 10, 10, 10]} />);
    const paths = container.querySelectorAll('path');
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toContain('NaN');
    }
  });
});
