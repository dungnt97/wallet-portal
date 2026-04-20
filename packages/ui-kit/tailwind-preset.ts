// @wp/ui-kit — Tailwind CSS v3 preset
// Maps OKLCH CSS custom properties to Tailwind utility classes.
// Apps extend via: presets: [require('@wp/ui-kit/tailwind-preset')]
//
// Note: Tailwind 4 uses @theme directive in CSS — if apps migrate to v4,
// replace this preset with a CSS @theme block importing tokens.css.
// See: https://tailwindcss.com/docs/v4-upgrade

import type { Config } from 'tailwindcss';

// CSS var reference helper — produces `var(--<name>)` for Tailwind color values
const v = (name: string) => `var(--${name})`;

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Semantic surface colors
        bg: {
          DEFAULT: v('bg'),
          elev: v('bg-elev'),
          muted: v('bg-muted'),
          sunken: v('bg-sunken'),
          hover: v('bg-hover'),
        },

        // Border / divider
        line: {
          DEFAULT: v('line'),
          strong: v('line-strong'),
        },

        // Text scale
        text: {
          DEFAULT: v('text'),
          muted: v('text-muted'),
          subtle: v('text-subtle'),
          faint: v('text-faint'),
        },

        // Primary accent (indigo by default, overridable via data-accent)
        accent: {
          DEFAULT: v('accent'),
          hover: v('accent-hover'),
          soft: v('accent-soft'),
          line: v('accent-line'),
          text: v('accent-text'),
        },

        // Status colors
        ok: {
          DEFAULT: v('ok'),
          soft: v('ok-soft'),
          line: v('ok-line'),
          text: v('ok-text'),
        },
        warn: {
          DEFAULT: v('warn'),
          soft: v('warn-soft'),
          line: v('warn-line'),
          text: v('warn-text'),
        },
        err: {
          DEFAULT: v('err'),
          soft: v('err-soft'),
          line: v('err-line'),
          text: v('err-text'),
        },
        info: {
          DEFAULT: v('info'),
          soft: v('info-soft'),
          line: v('info-line'),
          text: v('info-text'),
        },

        // Chain brand colors
        bnb: v('bnb'),
        sol: v('sol'),

        // Token brand colors
        usdt: v('usdt'),
        usdc: v('usdc'),
      },

      borderRadius: {
        sm: v('radius-sm'),
        DEFAULT: v('radius'),
        md: v('radius-md'),
        lg: v('radius-lg'),
        xl: v('radius-xl'),
      },

      boxShadow: {
        sm: v('shadow-sm'),
        DEFAULT: v('shadow'),
        md: v('shadow-md'),
        lg: v('shadow-lg'),
      },

      fontFamily: {
        sans: [v('font-sans')],
        mono: [v('font-mono')],
        serif: [v('font-serif')],
      },

      spacing: {
        'gap-xs': v('gap-xs'),
        'gap-sm': v('gap-sm'),
        gap: v('gap'),
        'gap-lg': v('gap-lg'),
        'gap-xl': v('gap-xl'),
        'row-px': v('row-px'),
        'sidebar-w': v('sidebar-w'),
        'sidebar-collapsed-w': v('sidebar-collapsed-w'),
        'topbar-h': v('topbar-h'),
      },

      height: {
        'row-h': v('row-h'),
        'topbar-h': v('topbar-h'),
      },
    },
  },
};

export default preset;
