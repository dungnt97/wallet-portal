// Tests for selection-store.ts — Zustand store for row selection and modal open state.
import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../selection-store';

// Reset store state before each test to ensure isolation.
beforeEach(() => {
  useSelectionStore.setState({ selected: {}, modals: {} });
});

describe('selection store — setSelected', () => {
  it('sets a row id for a table', () => {
    useSelectionStore.getState().setSelected('deposits', 'row-1');
    expect(useSelectionStore.getState().selected['deposits']).toBe('row-1');
  });

  it('overwrites an existing selection for the same table', () => {
    useSelectionStore.getState().setSelected('deposits', 'row-1');
    useSelectionStore.getState().setSelected('deposits', 'row-2');
    expect(useSelectionStore.getState().selected['deposits']).toBe('row-2');
  });

  it('tracks selections for multiple tables independently', () => {
    useSelectionStore.getState().setSelected('deposits', 'dep-1');
    useSelectionStore.getState().setSelected('withdrawals', 'wd-1');
    expect(useSelectionStore.getState().selected['deposits']).toBe('dep-1');
    expect(useSelectionStore.getState().selected['withdrawals']).toBe('wd-1');
  });

  it('accepts null to deselect a row', () => {
    useSelectionStore.getState().setSelected('deposits', 'row-1');
    useSelectionStore.getState().setSelected('deposits', null);
    expect(useSelectionStore.getState().selected['deposits']).toBeNull();
  });
});

describe('selection store — clearSelected', () => {
  it('sets selected row to null for the given table', () => {
    useSelectionStore.getState().setSelected('deposits', 'row-1');
    useSelectionStore.getState().clearSelected('deposits');
    expect(useSelectionStore.getState().selected['deposits']).toBeNull();
  });

  it('does not affect other tables', () => {
    useSelectionStore.getState().setSelected('deposits', 'row-1');
    useSelectionStore.getState().setSelected('withdrawals', 'wd-1');
    useSelectionStore.getState().clearSelected('deposits');
    expect(useSelectionStore.getState().selected['withdrawals']).toBe('wd-1');
  });
});

describe('selection store — openModal / closeModal', () => {
  it('sets modal to open', () => {
    useSelectionStore.getState().openModal('cancel-withdrawal');
    expect(useSelectionStore.getState().modals['cancel-withdrawal']).toBe(true);
  });

  it('sets modal to closed', () => {
    useSelectionStore.getState().openModal('cancel-withdrawal');
    useSelectionStore.getState().closeModal('cancel-withdrawal');
    expect(useSelectionStore.getState().modals['cancel-withdrawal']).toBe(false);
  });

  it('multiple modals are tracked independently', () => {
    useSelectionStore.getState().openModal('modal-a');
    useSelectionStore.getState().openModal('modal-b');
    useSelectionStore.getState().closeModal('modal-a');
    expect(useSelectionStore.getState().modals['modal-a']).toBe(false);
    expect(useSelectionStore.getState().modals['modal-b']).toBe(true);
  });
});

describe('selection store — isModalOpen', () => {
  it('returns false for unknown modal id', () => {
    expect(useSelectionStore.getState().isModalOpen('nonexistent')).toBe(false);
  });

  it('returns true after openModal', () => {
    useSelectionStore.getState().openModal('my-modal');
    expect(useSelectionStore.getState().isModalOpen('my-modal')).toBe(true);
  });

  it('returns false after closeModal', () => {
    useSelectionStore.getState().openModal('my-modal');
    useSelectionStore.getState().closeModal('my-modal');
    expect(useSelectionStore.getState().isModalOpen('my-modal')).toBe(false);
  });
});
