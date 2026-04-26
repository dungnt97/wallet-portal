// Tests for components/custody/page-frame.tsx — PageFrame layout component.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageFrame } from '../page-frame';

describe('PageFrame', () => {
  it('renders the title', () => {
    render(
      <PageFrame title="Deposits">
        <div />
      </PageFrame>
    );
    expect(screen.getByRole('heading', { name: 'Deposits' })).toBeInTheDocument();
  });

  it('renders children inside the frame', () => {
    render(
      <PageFrame title="Test">
        <div data-testid="body">content</div>
      </PageFrame>
    );
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('renders eyebrow when provided', () => {
    render(
      <PageFrame title="Test" eyebrow="Finance · Crypto">
        <span />
      </PageFrame>
    );
    expect(screen.getByText('Finance · Crypto')).toBeInTheDocument();
  });

  it('does not render eyebrow section when not provided', () => {
    render(
      <PageFrame title="Test">
        <span />
      </PageFrame>
    );
    expect(document.querySelector('.page-eyebrow')).not.toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <PageFrame title="Test" subtitle="Showing last 100 entries">
        <span />
      </PageFrame>
    );
    expect(screen.getByText('Showing last 100 entries')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(
      <PageFrame title="Test">
        <span />
      </PageFrame>
    );
    expect(document.querySelector('.page-subtitle')).not.toBeInTheDocument();
  });

  it('renders actions slot when provided', () => {
    render(
      <PageFrame title="Test" actions={<button type="button">Export</button>}>
        <span />
      </PageFrame>
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('does not render actions container when not provided', () => {
    render(
      <PageFrame title="Test">
        <span />
      </PageFrame>
    );
    expect(document.querySelector('.page-actions')).not.toBeInTheDocument();
  });

  it('renders policyStrip when provided', () => {
    render(
      <PageFrame title="Test" policyStrip={<div data-testid="policy-strip" />}>
        <span />
      </PageFrame>
    );
    expect(screen.getByTestId('policy-strip')).toBeInTheDocument();
  });

  it('renders kpis slot when provided', () => {
    render(
      <PageFrame title="Test" kpis={<div data-testid="kpi-strip" />}>
        <span />
      </PageFrame>
    );
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
  });

  it('applies page-dense class by default', () => {
    const { container } = render(
      <PageFrame title="Test">
        <span />
      </PageFrame>
    );
    expect((container.firstChild as HTMLElement).className).toContain('page-dense');
  });

  it('does not apply page-dense when dense=false', () => {
    const { container } = render(
      <PageFrame title="Test" dense={false}>
        <span />
      </PageFrame>
    );
    expect((container.firstChild as HTMLElement).className).not.toContain('page-dense');
  });

  it('applies custom className to outer wrapper', () => {
    const { container } = render(
      <PageFrame title="Test" className="my-custom-class">
        <span />
      </PageFrame>
    );
    expect((container.firstChild as HTMLElement).className).toContain('my-custom-class');
  });

  it('always applies page class', () => {
    const { container } = render(
      <PageFrame title="Test">
        <span />
      </PageFrame>
    );
    expect((container.firstChild as HTMLElement).className).toContain('page');
  });
});
