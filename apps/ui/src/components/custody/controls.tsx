// Small stateful controls — Tabs, Filter pill, Toggle, Segmented.
// Ports prototype primitives.jsx companions. Grouped in one file because
// each is < 30 LOC and they share no internal state.
import { I } from '@/icons';

// ── Tabs ──────────────────────────────────────────────────────────────────────

interface TabItem {
  value: string;
  label: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (next: string) => void;
  embedded?: boolean;
}

export function Tabs({ tabs, value, onChange, embedded }: TabsProps) {
  return (
    <div className={`tabs${embedded ? ' tabs-embedded' : ''}`}>
      {tabs.map((t) => (
        <button
          key={t.value}
          className={`tab ${value === t.value ? 'active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="text-muted text-xs" style={{ marginLeft: 6 }}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Filter pill (dashed border until active) ──────────────────────────────────

interface FilterProps {
  label: React.ReactNode;
  value?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClear?: () => void;
}

export function Filter({ label, value, active, onClick, onClear }: FilterProps) {
  return (
    <button className={`filter ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
      {value && <span className="filter-value">{value}</span>}
      {active ? (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClear?.();
          }}
          style={{ display: 'inline-grid', placeItems: 'center' }}
        >
          <I.X size={11} />
        </span>
      ) : (
        <I.ChevronDown size={10} style={{ opacity: 0.6 }} />
      )}
    </button>
  );
}

// ── Toggle (iOS-like switch) ──────────────────────────────────────────────────

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ on, onChange }: ToggleProps) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  );
}

// ── Segmented control (radio group styled as pills) ───────────────────────────

interface SegmentedOption<V extends string> {
  value: V;
  label: React.ReactNode;
}

interface SegmentedProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (next: V) => void;
}

export function Segmented<V extends string>({ options, value, onChange }: SegmentedProps<V>) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
