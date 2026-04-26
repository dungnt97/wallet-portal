// Sequence diagram renderer — lifelines + arrows + notes in SVG.
// Ported from prototype page_arch_sequence.jsx SequenceDiagram.
import { ACTOR_TONE, type Sequence } from './sequence-data';

const COL_W = 150;
const LEFT_PAD = 16;
const RIGHT_PAD = 16;
const HEAD_H = 54;
const ROW_H = 44;

interface Props {
  sequence: Sequence;
}

export function SequenceDiagram({ sequence }: Props) {
  const { actors, messages } = sequence;
  const colX = (i: number) => LEFT_PAD + COL_W / 2 + i * COL_W;
  const actorIdx = (id: string) => actors.findIndex((a) => a.id === id);

  const width = LEFT_PAD + COL_W * actors.length + RIGHT_PAD;
  const height = HEAD_H + messages.length * ROW_H + 40;

  return (
    <div className="seq-diagram-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="seq-svg" style={{ minWidth: width }}>
        {/* lifelines */}
        {actors.map((a, i) => (
          <line
            key={`ll-${a.id}`}
            x1={colX(i)}
            y1={HEAD_H}
            x2={colX(i)}
            y2={height - 20}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity="0.8"
          />
        ))}

        {/* actor heads */}
        {actors.map((a, i) => {
          const tone = ACTOR_TONE[a.tone];
          return (
            <g key={`h-${a.id}`}>
              <rect
                x={colX(i) - 62}
                y={10}
                width="124"
                height="34"
                rx="8"
                fill={tone.bg}
                stroke={tone.border}
                strokeWidth="1"
              />
              <text
                x={colX(i)}
                y={31}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={tone.text}
              >
                {a.label}
              </text>
            </g>
          );
        })}

        {/* messages */}
        {messages.map((m, i) => {
          const y = HEAD_H + 26 + i * ROW_H;
          if (m.note && !m.from) {
            const spanFrom = m.span ? colX(m.span[0]) : LEFT_PAD + 10;
            const spanTo = m.span ? colX(m.span[1]) : width - 10;
            return (
              <g key={`m-${i}`}>
                <rect
                  x={spanFrom}
                  y={y - 12}
                  width={spanTo - spanFrom}
                  height="22"
                  rx="4"
                  fill="var(--warn-soft)"
                  opacity="0.55"
                  stroke="var(--warn-line)"
                  strokeDasharray="3 3"
                />
                <text
                  x={(spanFrom + spanTo) / 2}
                  y={y + 3}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontStyle="italic"
                  fill="var(--warn-text)"
                >
                  {m.note}
                </text>
              </g>
            );
          }
          const fromI = actorIdx(m.from!);
          const toI = actorIdx(m.to!);
          if (fromI < 0 || toI < 0) return null;
          const x1 = colX(fromI);
          const x2 = colX(toI);
          const isReturn = m.kind === 'return';
          const isAsync = m.kind === 'async';
          const color = isReturn ? 'var(--text-muted)' : isAsync ? 'var(--accent)' : 'var(--text)';
          const stroke = isReturn ? '4 3' : undefined;
          const marker = isReturn ? 'ret' : isAsync ? 'async' : 'sync';
          const midX = (x1 + x2) / 2;
          return (
            <g key={`m-${i}`}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={color}
                strokeWidth="1.2"
                strokeDasharray={stroke}
                markerEnd={`url(#arrow-${marker})`}
              />
              {m.label?.split('\n').map((line, li) => (
                <text
                  key={li}
                  x={midX}
                  y={y - 6 - ((m.label?.split('\n').length ?? 1) - 1 - li) * 12}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill={isReturn ? 'var(--text-muted)' : 'var(--text)'}
                  fontStyle={isReturn ? 'italic' : 'normal'}
                >
                  {line}
                </text>
              ))}
              {m.group && (
                <text
                  x={midX}
                  y={y + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-faint)"
                  fontStyle="italic"
                >
                  {m.group}
                </text>
              )}
            </g>
          );
        })}

        <defs>
          <marker
            id="arrow-sync"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text)" />
          </marker>
          <marker
            id="arrow-async"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10" stroke="var(--accent)" fill="none" strokeWidth="1.4" />
          </marker>
          <marker
            id="arrow-ret"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10"
              stroke="var(--text-muted)"
              fill="none"
              strokeWidth="1.2"
            />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
