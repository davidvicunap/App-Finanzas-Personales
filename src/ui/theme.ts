/**
 * TEMA CLARO / OSCURO
 * La preferencia vive en los ajustes (IndexedDB), pero también se copia en
 * localStorage para que index.html la aplique ANTES de pintar (sin parpadeo).
 */
import type { ThemePref } from '../domain/types';

export const THEME_STORAGE_KEY = 'mis-finanzas-theme';

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePref): void {
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0D0F14' : '#1F3A5F');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* modo privado: no pasa nada */
  }
}
