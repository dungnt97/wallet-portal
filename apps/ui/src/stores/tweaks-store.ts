// Zustand store — theme, density, accent tweaks persisted to localStorage
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'cozy';
export type Accent = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
export type Typography = 'sans' | 'mono';

const ACCENT_COLORS: Record<Accent, string> = {
  indigo:  'oklch(55% 0.18 268)',
  emerald: 'oklch(58% 0.16 165)',
  amber:   'oklch(70% 0.16 70)',
  rose:    'oklch(60% 0.18 12)',
  slate:   'oklch(40% 0.02 260)',
};

interface TweaksState {
  theme: Theme;
  density: Density;
  accent: Accent;
  typography: Typography;
  showRiskFlags: boolean;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setAccent: (a: Accent) => void;
  setTypography: (t: Typography) => void;
  setShowRiskFlags: (v: boolean) => void;
  toggleTheme: () => void;
}

export const useTweaksStore = create<TweaksState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      density: 'comfortable',
      accent: 'indigo',
      typography: 'sans',
      showRiskFlags: true,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setDensity: (density) => {
        set({ density });
        document.documentElement.setAttribute('data-density', density);
      },
      setAccent: (accent) => {
        set({ accent });
        document.documentElement.style.setProperty('--accent', ACCENT_COLORS[accent]);
      },
      setTypography: (typography) => {
        set({ typography });
        document.documentElement.setAttribute('data-typography', typography);
      },
      setShowRiskFlags: (showRiskFlags) => set({ showRiskFlags }),
      toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
    }),
    {
      name: 'wp-tweaks',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          document.documentElement.setAttribute('data-density', state.density);
          document.documentElement.style.setProperty('--accent', ACCENT_COLORS[state.accent]);
        }
      },
    }
  )
);

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}
