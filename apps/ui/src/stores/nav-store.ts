// Zustand store — sidebar collapsed state + mobile overlay
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NavState {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  setMobileOpen: (v: boolean) => void;
  toggleMobileOpen: () => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      mobileOpen: false,

      setCollapsed: (collapsed) => set({ collapsed }),
      toggleCollapsed: () => set({ collapsed: !get().collapsed }),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
      toggleMobileOpen: () => set({ mobileOpen: !get().mobileOpen }),
    }),
    {
      name: 'wp-nav',
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
);
