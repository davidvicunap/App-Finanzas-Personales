import { describe, expect, it } from 'vitest';
import { detectRecurring, normalizeNote, recurringMonthlyTotal } from './recurring';
import { CAD_ONLY, tx } from '../test/factories';

const monthly = (note: string, amounts: number[], cat = 'cat-subscriptions') =>
  amounts.map((a, i) => tx({ note, amountCents: a, categoryId: cat, date: `2026-${String(7 + i).padStart(2, '0')}-05` }));

describe('recurrentes', () => {
  it('normalizeNote', () => {
    expect(normalizeNote('Netflix 11/26 #123')).toBe('netflix');
    expect(normalizeNote('  Teléfono   Rogers ')).toBe('telefono rogers');
  });

  it('detecta una suscripción mensual y su próximo cargo', () => {
    const items = detectRecurring(monthly('Netflix', [1899, 1899, 1899, 1899]), '2026-11-09', CAD_ONLY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Netflix', amountCents: 1899, months: 4, nextDate: '2026-11-05', changeRatio: null });
  });

  it('detecta un aumento de precio', () => {
    const [item] = detectRecurring(monthly('Spotify', [1199, 1199, 1299]), '2026-11-09', CAD_ONLY);
    expect(item?.changeRatio).toBeCloseTo(100 / 1199);
  });

  it('ignora gastos sin nota, irregulares o de solo 2 meses', () => {
    const txs = [
      ...monthly('', [5000, 5000, 5000]),
      ...monthly('Costco', [8000, 25000, 4000], 'cat-groceries'),
      ...monthly('Gimnasio', [4000, 4000]),
    ];
    expect(detectRecurring(txs, '2026-11-09', CAD_ONLY)).toEqual([]);
  });

  it('respeta los descartados y suma el total mensual', () => {
    const txs = [...monthly('Netflix', [1899, 1899, 1899]), ...monthly('Rogers', [8500, 8500, 8500], 'cat-utilities')];
    const all = detectRecurring(txs, '2026-11-09', CAD_ONLY);
    expect(recurringMonthlyTotal(all)).toBe(10_399);
    expect(detectRecurring(txs, '2026-11-09', CAD_ONLY, ['cat-utilities|rogers'])).toHaveLength(1);
  });
});
