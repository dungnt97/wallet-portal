// Hash — shortened transaction hash with copy-on-hover icon.
// Ports prototype primitives.jsx `Hash`.
import { I } from '@/icons';
import { shortHash } from '@/lib/format';

interface Props {
  value?: string | null;
  chars?: number;
}

export function Hash({ value, chars = 6 }: Props) {
  if (!value) return <span className="text-faint">—</span>;
  return (
    <span className="hash" title={value}>
      {shortHash(value, chars, 4)}
      <I.Copy size={11} className="copy" />
    </span>
  );
}
