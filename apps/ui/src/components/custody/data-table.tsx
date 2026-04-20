// Data table — generic table with optional selection column + empty state.
// Ports prototype primitives.jsx `Table`. Named `DataTable` to avoid
// clashing with the native `<table>` element reference.
import { useEffect, useRef } from 'react';

export interface Column<T> {
  label: string;
  render: (row: T) => React.ReactNode;
  num?: boolean;
  width?: number | string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onToggleSelect?: (id: string | number) => void;
  onToggleAll?: (next: boolean) => void;
  getRowId?: (row: T) => string | number;
  compact?: boolean;
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  selectable,
  selectedIds = [],
  onToggleSelect,
  onToggleAll,
  getRowId,
}: Props<T>) {
  const allSelected =
    !!selectable &&
    rows.length > 0 &&
    rows.every((r) => selectedIds.includes(getRowId ? getRowId(r) : 0));
  const someSelected =
    !!selectable &&
    rows.some((r) => selectedIds.includes(getRowId ? getRowId(r) : 0)) &&
    !allSelected;

  return (
    <table className="table">
      <thead>
        <tr>
          {selectable && (
            <th style={{ width: 32, paddingRight: 0 }}>
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => onToggleAll?.(!allSelected)}
              />
            </th>
          )}
          {columns.map((c, i) => (
            <th
              key={i}
              className={c.num ? 'num' : ''}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length + (selectable ? 1 : 0)}>
              <div className="table-empty">
                <div className="table-empty-title">No results</div>
                <div className="text-sm">Try adjusting your filters.</div>
              </div>
            </td>
          </tr>
        )}
        {rows.map((r, ri) => {
          const id = getRowId ? getRowId(r) : ri;
          const selected = selectedIds.includes(id);
          return (
            <tr key={id} className={selected ? 'selected' : ''} onClick={() => onRowClick?.(r)}>
              {selectable && (
                <td style={{ paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect?.(id)}
                  />
                </td>
              )}
              {columns.map((c, ci) => (
                <td key={ci} className={c.num ? 'num' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
