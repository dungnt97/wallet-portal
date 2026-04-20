// Risk indicator — low / med / high pill. Ports prototype primitives.jsx `Risk`.

export type RiskLevel = 'low' | 'med' | 'high';

interface Props {
  level?: RiskLevel | null;
}

export function Risk({ level }: Props) {
  if (!level) return null;
  const mark = level === 'low' ? '·' : level === 'med' ? '!' : '!!';
  return (
    <span className={`risk ${level}`}>
      {mark} {level}
    </span>
  );
}
