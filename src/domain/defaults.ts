/**
 * Datos iniciales: categorías pensadas para un hogar en Canadá y una cuenta
 * principal. Todo se puede renombrar, archivar o ampliar desde Ajustes.
 */
import type { Account, Category, CategoryKind, Locale, Member, Settings } from './types';

/** [clave de traducción, emoji]. La clave se traduce en src/i18n. */
const EXPENSE: ReadonlyArray<readonly [string, string]> = [
  ['groceries', '🛒'],
  ['dining', '🍽️'],
  ['housing', '🏠'],
  ['utilities', '💡'],
  ['transport', '🚗'],
  ['insurance', '🛡️'],
  ['health', '🩺'],
  ['shopping', '🛍️'],
  ['subscriptions', '🔁'],
  ['entertainment', '🎬'],
  ['travel', '✈️'],
  ['kids', '👶'],
  ['personal_care', '💅'],
  ['education', '📚'],
  ['gifts', '🎁'],
  ['fees', '🏦'],
  ['other_expense', '🧾'],
];

const INCOME: ReadonlyArray<readonly [string, string]> = [
  ['salary', '💼'],
  ['freelance', '💻'],
  ['investment_income', '📈'],
  ['benefits', '🍁'], // CCB, crédito GST/HST, etc.
  ['refunds', '↩️'],
  ['other_income', '💰'],
];

function build(kind: CategoryKind, list: ReadonlyArray<readonly [string, string]>): Category[] {
  return list.map(([key, emoji], order) => ({
    id: `cat-${key}`, // ids estables: facilitan migraciones e importaciones
    kind,
    name: '',
    builtinKey: key,
    emoji,
    archived: false,
    order,
  }));
}

export function defaultCategories(): Category[] {
  return [...build('expense', EXPENSE), ...build('income', INCOME)];
}

export const MEMBER_COLORS = ['#4F7CFF', '#E0569B', '#12A37F', '#F59E0B'];

export function defaultMember(locale: Locale, now: string): Member {
  return { id: 'member-1', name: locale === 'es' ? 'Yo' : 'Me', color: MEMBER_COLORS[0]!, createdAt: now };
}

export function defaultAccount(locale: Locale, now: string): Account {
  return {
    id: 'account-main',
    name: locale === 'es' ? 'Cuenta principal' : 'Main account',
    type: 'chequing',
    currency: 'CAD',
    ownerId: null,
    institution: '',
    archived: false,
    createdAt: now,
  };
}

export function defaultSettings(locale: Locale): Settings {
  return {
    id: 'settings',
    locale,
    theme: 'system',
    baseCurrency: 'CAD',
    fxRates: {},
    currentMemberId: 'member-1',
    defaultAccountId: 'account-main',
  };
}

/** Idioma inicial según el navegador: español si empieza por "es", si no inglés. */
export function detectLocale(languages: readonly string[] = globalThis.navigator?.languages ?? []): Locale {
  return languages.some((l) => l.toLowerCase().startsWith('es')) ? 'es' : 'en';
}
