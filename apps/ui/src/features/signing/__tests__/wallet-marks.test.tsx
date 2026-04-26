// Tests for features/signing/wallet-marks.tsx — WalletMark SVG brand icons.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WalletMark } from '../wallet-marks';

describe('WalletMark', () => {
  it('renders metamask SVG', () => {
    const { container } = render(<WalletMark kind="metamask" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders phantom SVG', () => {
    const { container } = render(<WalletMark kind="phantom" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders walletconnect SVG', () => {
    const { container } = render(<WalletMark kind="walletconnect" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders ledger SVG', () => {
    const { container } = render(<WalletMark kind="ledger" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns null for unknown kind', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    const { container } = render(<WalletMark kind={'unknown' as any} />);
    expect(container.firstChild).toBeNull();
  });

  it('defaults size to 24', () => {
    const { container } = render(<WalletMark kind="metamask" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('accepts custom size', () => {
    const { container } = render(<WalletMark kind="phantom" size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('metamask SVG has aria-hidden', () => {
    const { container } = render(<WalletMark kind="metamask" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('phantom SVG has aria-hidden', () => {
    const { container } = render(<WalletMark kind="phantom" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('walletconnect SVG has aria-hidden', () => {
    const { container } = render(<WalletMark kind="walletconnect" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('ledger SVG has aria-hidden', () => {
    const { container } = render(<WalletMark kind="ledger" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
