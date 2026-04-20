// Optional TS token map — mirrors CSS custom properties as typed constants.
// Consumers can import for use in inline styles or JS-driven animation.
// CSS variables remain the primary consumption path via tokens.css.

export const tokens = {
  color: {
    accent: 'var(--accent)',
    accentHover: 'var(--accent-hover)',
    accentSoft: 'var(--accent-soft)',
    accentLine: 'var(--accent-line)',
    accentText: 'var(--accent-text)',

    ok: 'var(--ok)',
    okSoft: 'var(--ok-soft)',
    okLine: 'var(--ok-line)',
    okText: 'var(--ok-text)',

    warn: 'var(--warn)',
    warnSoft: 'var(--warn-soft)',
    warnLine: 'var(--warn-line)',
    warnText: 'var(--warn-text)',

    err: 'var(--err)',
    errSoft: 'var(--err-soft)',
    errLine: 'var(--err-line)',
    errText: 'var(--err-text)',

    info: 'var(--info)',
    infoSoft: 'var(--info-soft)',
    infoLine: 'var(--info-line)',
    infoText: 'var(--info-text)',

    bg: 'var(--bg)',
    bgElev: 'var(--bg-elev)',
    bgMuted: 'var(--bg-muted)',
    bgSunken: 'var(--bg-sunken)',
    bgHover: 'var(--bg-hover)',

    text: 'var(--text)',
    textMuted: 'var(--text-muted)',
    textSubtle: 'var(--text-subtle)',
    textFaint: 'var(--text-faint)',

    line: 'var(--line)',
    lineStrong: 'var(--line-strong)',

    bnb: 'var(--bnb)',
    sol: 'var(--sol)',
    usdt: 'var(--usdt)',
    usdc: 'var(--usdc)',
  },

  radius: {
    sm: 'var(--radius-sm)',
    DEFAULT: 'var(--radius)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },

  shadow: {
    sm: 'var(--shadow-sm)',
    DEFAULT: 'var(--shadow)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
  },

  font: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
    serif: 'var(--font-serif)',
  },

  layout: {
    sidebarW: 'var(--sidebar-w)',
    sidebarCollapsedW: 'var(--sidebar-collapsed-w)',
    topbarH: 'var(--topbar-h)',
  },
} as const;

export type Tokens = typeof tokens;
