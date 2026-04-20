// Zustand store — theme/density/accent/typography/sidebar tweaks
// Mirrors prototype `window.__TWEAKS__` + the side-effect in prototype/app.jsx
// that writes data-theme/data-density/data-accent/data-typography on <html>.
// Persisted to localStorage under wp-tweaks.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'cozy';
// Accent palette matches prototype tweaks.jsx swatches (indigo default + 4).
export type Accent = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
export type Typography = 'sans' | 'mono';

interface TweaksState {
  theme: Theme;
  density: Density;
  accent: Accent;
  typography: Typography;
  sidebarCollapsed: boolean;
  showRiskFlags: boolean;

  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setAccent: (a: Accent) => void;
  setTypography: (t: Typography) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setShowRiskFlags: (v: boolean) => void;
  toggleTheme: () => void;
  toggleSidebarCollapsed: () => void;
}

/** Writes all tweak vars as `data-*` attributes on <html> — drives base.css
 *  selectors like `[data-theme="dark"]`, `[data-accent="emerald"]`, etc. */
function applyToDocument(
  state: Pick<TweaksState, 'theme' | 'density' | 'accent' | 'typography'>
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', state.theme);
  root.setAttribute('data-density', state.density);
  root.setAttribute('data-accent', state.accent);
  root.setAttribute('data-typography', state.typography);
}

export const useTweaksStore = create<TweaksState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      density: 'comfortable',
      accent: 'indigo',
      typography: 'sans',
      sidebarCollapsed: false,
      showRiskFlags: true,

      setTheme: (theme) => {
        set({ theme });
        applyToDocument({ ...get(), theme });
      },
      setDensity: (density) => {
        set({ density });
        applyToDocument({ ...get(), density });
      },
      setAccent: (accent) => {
        set({ accent });
        applyToDocument({ ...get(), accent });
      },
      setTypography: (typography) => {
        set({ typography });
        applyToDocument({ ...get(), typography });
      },
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setShowRiskFlags: (showRiskFlags) => set({ showRiskFlags }),
      toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
      toggleSidebarCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    }),
    {
      name: 'wp-tweaks',
      onRehydrateStorage: () => (state) => {
        if (state) applyToDocument(state);
      },
    }
  )
);
