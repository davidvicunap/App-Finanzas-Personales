import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';
import { categoryLabel, translate } from '.';
import { defaultCategories } from '../domain/defaults';
import { ACCOUNT_TYPES, ASSET_CLASSES } from '../domain/types';
import type { InsightCode } from '../domain/insights';

describe('i18n', () => {
  it('inglés y español tienen las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('ningún texto está vacío', () => {
    for (const dict of [es, en]) for (const v of Object.values(dict)) expect(v.trim()).not.toBe('');
  });

  it('inserta parámetros', () => {
    expect(translate('es', 'dash.savingsRate', { pct: 25 })).toBe('Tasa de ahorro 25%');
    expect(translate('en', 'dash.savingsRate', { pct: 25 })).toBe('Savings rate 25%');
  });

  it('todas las categorías por defecto tienen traducción en ambos idiomas', () => {
    for (const c of defaultCategories()) {
      expect(categoryLabel('es', c)).not.toMatch(/^cat\./);
      expect(categoryLabel('en', c)).not.toMatch(/^cat\./);
    }
  });

  it('un nombre escrito por la persona tiene prioridad', () => {
    expect(categoryLabel('en', { name: 'Costco', builtinKey: 'groceries' })).toBe('Costco');
  });
});

describe('claves dinámicas (TypeScript no puede comprobarlas)', () => {
  const codes = [
    'missing_fx', 'negative_cashflow', 'budget_over', 'budget_near', 'category_up', 'category_down', 'savings_up',
    'savings_down', 'recurring_up', 'recurring_total', 'goal_done', 'goal_behind', 'stale_balances', 'stale_prices', 'no_data',
  ] satisfies InsightCode[];
  it.each(['es', 'en'] as const)('%s: insights, acciones, activos y cuentas', (locale) => {
    const dict: Record<string, string> = locale === 'es' ? es : en;
    for (const c of codes) {
      expect(dict[`insight.${c}`], `insight.${c}`).toBeTruthy();
      expect(dict[`action.${c}`], `action.${c}`).toBeTruthy();
    }
    for (const a of ASSET_CLASSES) expect(dict[`asset.${a}`], `asset.${a}`).toBeTruthy();
    for (const a of ACCOUNT_TYPES) expect(dict[`acct.${a}`], `acct.${a}`).toBeTruthy();
  });
});
