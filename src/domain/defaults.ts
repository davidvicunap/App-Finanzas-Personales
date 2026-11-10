/**
 * Datos iniciales: categorías pensadas para un hogar en Canadá y una cuenta
 * principal. Todo se puede renombrar, archivar o ampliar desde Ajustes.
 */
import type { Account, BudgetGroup, Category, CategoryKind, Locale, Member, Settings } from './types';

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

/**
 * Clasificación inicial para el método 50/30/20 (necesidades vs. deseos).
 * Es una sugerencia: puedes cambiarla en Ajustes.
 */
export const DEFAULT_GROUPS: Record<string, BudgetGroup> = {
  groceries: 'needs',
  housing: 'needs',
  utilities: 'needs',
  transport: 'needs',
  insurance: 'needs',
  health: 'needs',
  kids: 'needs',
  education: 'needs',
  fees: 'needs',
  dining: 'wants',
  shopping: 'wants',
  subscriptions: 'wants',
  entertainment: 'wants',
  travel: 'wants',
  personal_care: 'wants',
  gifts: 'wants',
  other_expense: 'wants',
};

function build(kind: CategoryKind, list: ReadonlyArray<readonly [string, string]>): Category[] {
  return list.map(([key, emoji], order) => ({
    id: `cat-${key}`, // ids estables: facilitan migraciones e importaciones
    kind,
    name: '',
    builtinKey: key,
    emoji,
    archived: false,
    order,
    group: kind === 'expense' ? (DEFAULT_GROUPS[key] ?? null) : null,
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
    onboarded: false,
    budgetMethod: 'envelopes',
    projection: {
      // Supuestos editables, NO recomendaciones: tú decides qué escenarios usar.
      conservativeBps: 300,
      baseBps: 500,
      optimisticBps: 700,
      monthlyContributionCents: null,
      withdrawalRateBps: 400,
      annualExpensesCents: null,
    },
    dismissedRecurring: [],
  };
}

/** Idioma inicial según el navegador: español si empieza por "es", si no inglés. */
export function detectLocale(languages: readonly string[] = globalThis.navigator?.languages ?? []): Locale {
  return languages.some((l) => l.toLowerCase().startsWith('es')) ? 'es' : 'en';
}
