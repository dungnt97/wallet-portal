// Zustand store — selected row per table + modal open state
import { create } from 'zustand';

interface SelectionState {
  // Map of tableId → selected row id
  selected: Record<string, string | null>;
  // Map of modalId → open state
  modals: Record<string, boolean>;

  setSelected: (tableId: string, rowId: string | null) => void;
  clearSelected: (tableId: string) => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  isModalOpen: (modalId: string) => boolean;
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selected: {},
  modals: {},

  setSelected: (tableId, rowId) =>
    set((s) => ({ selected: { ...s.selected, [tableId]: rowId } })),

  clearSelected: (tableId) =>
    set((s) => ({ selected: { ...s.selected, [tableId]: null } })),

  openModal: (modalId) =>
    set((s) => ({ modals: { ...s.modals, [modalId]: true } })),

  closeModal: (modalId) =>
    set((s) => ({ modals: { ...s.modals, [modalId]: false } })),

  isModalOpen: (modalId) => get().modals[modalId] ?? false,
}));
