import { useEffect, useSyncExternalStore } from 'react';

import { isDarkTheme } from '../core/theme';

// What the browser says about the person's own light or dark choice.
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/**
 * Whether the dark theme is on for the saved choice, and puts the answer on
 * the page: data-theme on the html element is what the style sheet reads.
 * "System" follows the browser, also while the page is open.
 */
export function useTheme(mode: string): boolean {
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark);
  const isDark = isDarkTheme(mode, prefersDark);
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);
  return isDark;
}
