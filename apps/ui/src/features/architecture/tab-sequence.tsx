// Tab: sequence diagrams — per-flow timelines, switchable.
// Ported from prototype ArchSequence in page_arch_sequence.jsx.
import { useState } from 'react';
import { SEQUENCES } from './sequence-data';
import { SequenceDiagram } from './sequence-diagram';

export function TabSequence() {
  const [active, setActive] = useState(SEQUENCES[0]?.id ?? 'deposit');
  const seq = SEQUENCES.find((s) => s.id === active) ?? SEQUENCES[0];
  if (!seq) return null;

  return (
    <div className="arch-grid">
      <div className="arch-section">
        <h3>Sequence diagrams</h3>
        <p>
          Per-flow message timelines showing exactly which services talk to each other, in what
          order, sync vs async. Switch between flows.
        </p>

        <div className="seq-tabs">
          {SEQUENCES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`seq-tab ${active === s.id ? 'active' : ''}`}
              onClick={() => setActive(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="seq-legend">
          <span className="seq-legend-item">
            <span className="seq-legend-arrow sync" />
            sync call
          </span>
          <span className="seq-legend-item">
            <span className="seq-legend-arrow async" />
            async / event
          </span>
          <span className="seq-legend-item">
            <span className="seq-legend-arrow ret" />
            response
          </span>
          <span className="seq-legend-item">
            <span className="seq-legend-note" />
            pause / note
          </span>
        </div>

        <div className="arch-diagram seq-diagram-outer">
          <div className="seq-diagram-title">
            <div className="fw-600" style={{ fontSize: 14 }}>
              {seq.title}
            </div>
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>
              {seq.subtitle}
            </div>
          </div>
          <SequenceDiagram sequence={seq} />
        </div>
      </div>
    </div>
  );
}
