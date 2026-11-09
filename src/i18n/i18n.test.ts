import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';
import { categoryLabel, translate } from '.';
import { defaultCategories } from '../domain/defaults';

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
