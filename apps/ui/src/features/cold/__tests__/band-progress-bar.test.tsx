// Tests for features/cold/band-progress-bar.tsx — BandProgressBar visual component.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BandProgressBar } from '../band-progress-bar';

describe('BandProgressBar', () => {
  it('renders the track and labels', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={800} />
    );
    expect(container.querySelector('.cold-band-track')).toBeInTheDocument();
    expect(container.querySelector('.cold-band-labels')).toBeInTheDocument();
  });

  it('renders floor and ceiling labels', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={800} />
    );
    const labels = container.querySelector('.cold-band-labels');
    expect(labels?.textContent).toContain('Floor');
    expect(labels?.textContent).toContain('Ceiling');
  });

  it('renders fill bar, floor tick, ceiling tick, and marker', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={800} />
    );
    expect(container.querySelector('.cold-band-fill')).toBeInTheDocument();
    expect(container.querySelector('.cold-band-floor')).toBeInTheDocument();
    expect(container.querySelector('.cold-band-ceiling')).toBeInTheDocument();
    expect(container.querySelector('.cold-band-marker')).toBeInTheDocument();
  });

  it('uses ok color when balance is within band', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={800} />
    );
    const fill = container.querySelector('.cold-band-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--ok)');
  });

  it('uses warn color when balance is over ceiling', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={900} floorUsd={300} ceilingUsd={800} />
    );
    const fill = container.querySelector('.cold-band-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--warn)');
  });

  it('uses err color when balance is under floor', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={100} floorUsd={300} ceilingUsd={800} />
    );
    const fill = container.querySelector('.cold-band-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--err)');
  });

  it('clamps marker to 0 when balance is 0', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={0} floorUsd={300} ceilingUsd={800} />
    );
    const marker = container.querySelector('.cold-band-marker') as HTMLElement;
    expect(marker.style.left).toBe('0%');
  });

  it('clamps fill width to 100% when balance far exceeds ceiling', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={99999} floorUsd={300} ceilingUsd={800} />
    );
    const fill = container.querySelector('.cold-band-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('ceiling tick is at 80% of bar (ceiling / ceiling*1.25)', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={1000} />
    );
    // displayMax = 1250, ceilingPct = 1000/1250*100 = 80%
    const ceilEl = container.querySelector('.cold-band-ceiling') as HTMLElement;
    expect(ceilEl.style.left).toBe('80%');
  });

  it('marker matches fill width for in-band balance', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={1000} />
    );
    // displayMax = 1250, markerPct = 500/1250*100 = 40%
    const marker = container.querySelector('.cold-band-marker') as HTMLElement;
    const fill = container.querySelector('.cold-band-fill') as HTMLElement;
    expect(marker.style.left).toBe('40%');
    expect(fill.style.width).toBe('40%');
  });

  it('applies cold-wallet-band class to outer wrapper', () => {
    const { container } = render(
      <BandProgressBar balanceUsd={500} floorUsd={300} ceilingUsd={800} />
    );
    expect(container.querySelector('.cold-wallet-band')).toBeInTheDocument();
  });
});
