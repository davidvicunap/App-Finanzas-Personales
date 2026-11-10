/**
 * IDIOMAS
 * =======
 * `translate(locale, key, params)` devuelve el texto en el idioma pedido.
 * En los componentes se usa el hook `useI18n()` (ver ui/context.tsx).
 */
import { es, type MessageKey } from './es';
import { en } from './en';
import type { Category, Locale } from '../domain/types';

export type { MessageKey };

const DICTS: Record<Locale, Record<MessageKey, string>> = { es, en };

export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = DICTS[locale][key] ?? es[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Nombre visible de una categoría: el que escribiste, o la traducción por defecto. */
export function categoryLabel(locale: Locale, cat: Pick<Category, 'name' | 'builtinKey'>): string {
  if (cat.name) return cat.name;
  if (cat.builtinKey) return translate(locale, `cat.${cat.builtinKey}` as MessageKey);
  return '?';
}

export const LOCALES: readonly Locale[] = ['es', 'en'];
