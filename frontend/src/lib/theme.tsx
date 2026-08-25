'use client';

import React, {
  createContext, useCallback, useContext, useMemo, useSyncExternalStore,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  /** What is actually painted right now, after resolving `system`. */
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'konnect-theme';
const EVENT = 'konnect-theme-change';

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The theme lives in localStorage and on <html>, both outside React, so it is
 * read through useSyncExternalStore rather than mirrored into state.
 */
function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  window.addEventListener(EVENT, onChange);
  // Another tab changing the preference should move this one too.
  window.addEventListener('storage', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Snapshot must be a stable primitive, so both halves are packed into one string. */
function getSnapshot(): string {
  const theme = readTheme();
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  return `${theme}:${dark ? 'dark' : 'light'}`;
}

/** The server has no preference to read; the inline script fixes it up pre-paint. */
function getServerSnapshot() {
  return 'system:light';
}

/**
 * Writes `data-theme` on <html> for an explicit choice and removes it for
 * `system`, which lets the `prefers-color-scheme` block in globals.css win.
 * Kept in sync with the inline pre-hydration script in app/layout.tsx.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  root.style.colorScheme = dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0f0f13' : '#f1f0ec');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolved] = snapshot.split(':') as [Theme, 'light' | 'dark'];

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
