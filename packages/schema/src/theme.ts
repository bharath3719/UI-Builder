/**
 * The default design theme for a new project.
 *
 * The colour names are shadcn/ui's, deliberately: `background`/`foreground` pairs,
 * `primary`/`secondary`/`muted`/`accent`/`destructive`, plus `border`, `input` and
 * `ring`. Keeping that vocabulary means the built-in components, anything a user
 * writes against `var(--primary)`, and a future shadcn code emitter all name the same
 * things — the emitter becomes a rename of `hsl(a b% c%)` back to the bare triple
 * shadcn stores, and nothing else.
 *
 * Values are complete CSS colours rather than raw channel triples so that a colour
 * picker in the inspector can round-trip them without knowing the convention.
 *
 * This is the *design's* theme — what the user is building. It is unrelated to
 * `apps/web/src/styles/tokens.css`, which themes the studio chrome around it.
 */

import type { Theme } from './doc.js';

export const DEFAULT_THEME: Theme = {
  colors: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222 47% 11%)',

    card: 'hsl(0 0% 100%)',
    'card-foreground': 'hsl(222 47% 11%)',

    popover: 'hsl(0 0% 100%)',
    'popover-foreground': 'hsl(222 47% 11%)',

    primary: 'hsl(222 47% 11%)',
    'primary-foreground': 'hsl(210 40% 98%)',

    secondary: 'hsl(210 40% 96%)',
    'secondary-foreground': 'hsl(222 47% 11%)',

    muted: 'hsl(210 40% 96%)',
    'muted-foreground': 'hsl(215 16% 47%)',

    accent: 'hsl(210 40% 96%)',
    'accent-foreground': 'hsl(222 47% 11%)',

    destructive: 'hsl(0 72% 51%)',
    'destructive-foreground': 'hsl(210 40% 98%)',

    border: 'hsl(214 32% 91%)',
    input: 'hsl(214 32% 91%)',
    ring: 'hsl(222 47% 11%)',
  },

  fonts: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  },

  /* A 4px scale, named by step rather than by pixel value so the scale can be
     retuned later without every document that used it meaning something different. */
  space: {
    '0': '0px',
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '5': '20px',
    '6': '24px',
    '8': '32px',
    '10': '40px',
    '12': '48px',
    '16': '64px',
  },

  /* shadcn derives every radius from one `--radius`; the steps are spelled out here
     because the inspector needs a list to offer, and `md` is the 0.5rem default. */
  radii: {
    none: '0px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },

  breakpoints: [
    { id: 'base', label: 'Base', minWidth: 0 },
    { id: 'sm', label: 'Mobile L', minWidth: 640 },
    { id: 'md', label: 'Tablet', minWidth: 768 },
    { id: 'lg', label: 'Laptop', minWidth: 1024 },
    { id: 'xl', label: 'Desktop', minWidth: 1280 },
  ],
};
