import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'ui-builder.theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode or blocked storage — the CSS media query still resolves a theme.
  }
  return 'system';
}

/**
 * tokens.css resolves all three states on its own, so this only stamps the
 * explicit override and remembers it. `system` removes the attribute and hands
 * control back to prefers-color-scheme.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }

    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not being able to persist the choice is not worth failing over.
    }
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((current) => {
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      return next ?? 'system';
    });
  }, []);

  return { preference, setPreference, cycle };
}
