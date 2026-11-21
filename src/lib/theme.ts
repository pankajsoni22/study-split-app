import { readString, writeString } from './storage.ts';

// Mirrors public/theme-init.js, which applies the theme before first paint.
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'ss.theme';

export function getTheme(): Theme {
  const t = readString(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function setTheme(theme: Theme): void {
  writeString(KEY, theme === 'system' ? null : theme);
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
