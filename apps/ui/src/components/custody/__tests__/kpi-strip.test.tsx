import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiStrip } from '../kpi-strip';

const items = [
  { key: 'a', label: 'Label A', value: '100' },
  { key: 'b', label: 'Label B', value: '200', foot: <span>foot-b</span> },
  { key: 'c', label: 'Label C', value: <span data-testid="jsx-val">$42</span> },
];

describe('KpiStrip', () => {
  it('renders kpi-strip wrapper', () => {
    render(<KpiStrip items={[]} />);
    expect(document.querySelector('.kpi-strip')).toBeInTheDocument();
  });

  it('renders all items', () => {
    render(<KpiStrip items={items} />);
    expect(document.querySelectorAll('.kpi-mini').length).toBe(3);
  });

  it('renders label for each item', () => {
    render(<KpiStrip items={items} />);
    expect(screen.getByText('Label A')).toBeInTheDocument();
    expect(screen.getByText('Label B')).toBeInTheDocument();
  });

  it('renders value for each item', () => {
    render(<KpiStrip items={items} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renders JSX value', () => {
    render(<KpiStrip items={items} />);
    expect(screen.getByTestId('jsx-val')).toBeInTheDocument();
  });

  it('renders foot when provided', () => {
    render(<KpiStrip items={items} />);
    expect(screen.getByText('foot-b')).toBeInTheDocument();
  });

  it('does not render foot element when foot is omitted', () => {
    const noFoot = [{ key: 'x', label: 'L', value: 'V' }];
    render(<KpiStrip items={noFoot} />);
    expect(document.querySelector('.kpi-mini-foot')).not.toBeInTheDocument();
  });

  it('applies custom className to outer wrapper', () => {
    render(<KpiStrip items={[]} className="my-class" />);
    expect(document.querySelector('.kpi-strip.my-class')).toBeInTheDocument();
  });

  it('renders without className when not provided', () => {
    render(<KpiStrip items={[]} />);
    const el = document.querySelector('.kpi-strip');
    expect(el?.className).toBe('kpi-strip');
  });

  it('renders valueStyle on value element', () => {
    const itemsWithStyle = [{ key: 'k', label: 'L', value: 'V', valueStyle: { fontSize: 14 } }];
    render(<KpiStrip items={itemsWithStyle} />);
    const valueEl = document.querySelector('.kpi-mini-value') as HTMLElement;
    expect(valueEl.style.fontSize).toBe('14px');
  });

  it('renders empty list without errors', () => {
    render(<KpiStrip items={[]} />);
    expect(document.querySelector('.kpi-strip')).toBeInTheDocument();
    expect(document.querySelectorAll('.kpi-mini').length).toBe(0);
  });
});
