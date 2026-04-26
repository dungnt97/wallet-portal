import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '../data-table';

interface Row {
  id: string;
  name: string;
  value: number;
}

const cols = [
  { label: 'Name', render: (r: Row) => r.name },
  { label: 'Value', render: (r: Row) => String(r.value), num: true },
];

const rows: Row[] = [
  { id: 'a', name: 'Alpha', value: 10 },
  { id: 'b', name: 'Beta', value: 20 },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows empty state when no rows', () => {
    render(<DataTable columns={cols} rows={[]} />);
    expect(document.querySelector('.table-empty-title')).toHaveTextContent('No results');
  });

  it('calls onRowClick with row when row clicked', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={cols} rows={rows} onRowClick={onRowClick} />);
    const trs = document.querySelectorAll('tbody tr');
    fireEvent.click(trs[0]);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('renders selectable checkboxes when selectable=true', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={[]}
        getRowId={(r) => r.id}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
      />
    );
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // 1 header + 2 rows
    expect(checkboxes.length).toBe(3);
  });

  it('header checkbox is checked when all rows selected', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={['a', 'b']}
        getRowId={(r) => r.id}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
      />
    );
    const headerCheckbox = document.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(headerCheckbox.checked).toBe(true);
  });

  it('row checkbox is checked when row selected', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={['a']}
        getRowId={(r) => r.id}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
      />
    );
    const rowCheckboxes = document.querySelectorAll(
      'tbody input[type="checkbox"]'
    ) as NodeListOf<HTMLInputElement>;
    expect(rowCheckboxes[0].checked).toBe(true);
    expect(rowCheckboxes[1].checked).toBe(false);
  });

  it('selected row has selected class', () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={['a']}
        getRowId={(r) => r.id}
        onToggleSelect={vi.fn()}
        onToggleAll={vi.fn()}
      />
    );
    const trs = document.querySelectorAll('tbody tr');
    expect(trs[0]).toHaveClass('selected');
    expect(trs[1]).not.toHaveClass('selected');
  });

  it('calls onToggleAll when header checkbox clicked', () => {
    const onToggleAll = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={[]}
        getRowId={(r) => r.id}
        onToggleSelect={vi.fn()}
        onToggleAll={onToggleAll}
      />
    );
    const headerCheckbox = document.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.click(headerCheckbox);
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('calls onToggleSelect when row checkbox clicked', () => {
    const onToggleSelect = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={rows}
        selectable
        selectedIds={[]}
        getRowId={(r) => r.id}
        onToggleSelect={onToggleSelect}
        onToggleAll={vi.fn()}
      />
    );
    const rowCheckboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    fireEvent.click(rowCheckboxes[0]);
    expect(onToggleSelect).toHaveBeenCalledWith('a');
  });

  it('num column has num class', () => {
    render(<DataTable columns={cols} rows={rows} />);
    const ths = document.querySelectorAll('thead th');
    expect(ths[1]).toHaveClass('num');
  });

  it('renders table element', () => {
    render(<DataTable columns={cols} rows={[]} />);
    expect(document.querySelector('table.table')).toBeInTheDocument();
  });
});
