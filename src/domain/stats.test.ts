import { describe, expect, it } from 'vitest';
import { byCategory, categoryUsage, delta, groupByDay, inMonth, missingRates, monthlySeries, totals, type FxSettings } from './stats';
import type { Transaction } from './types';

let seq = 0;
function tx(p: Partial<Transaction>): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    type: 'expense',
    amountCents: 1000,
    currency: 'CAD',
    accountId: 'a1',
    categoryId: 'cat-groceries',
    date: '2026-11-09',
    note: '',
    memberId: null,
    createdAt: `2026-11-09T10:00:${String(seq).padStart(2, '0')}Z`,
    updatedAt: '',
    ...p,
  };
}

const CAD_ONLY: FxSettings = { baseCurrency: 'CAD', fxRates: {} };
const WITH_USD: FxSettings = {
  baseCurrency: 'CAD',
  fxRates: { USD: { rateMicros: 1_400_000, asOf: '2026-11-01', source: 'manual' } },
};

describe('totals', () => {
  it('ingresos − gastos = 0 exacto (el caso que daba "-$0")', () => {
    const t = totals(
      [tx({ type: 'income', amountCents: 30 }), tx({ amountCents: 10 }), tx({ amountCents: 20 })],
      CAD_ONLY,
    );
    expect(t.netCents).toBe(0);
    expect(Object.is(t.netCents, -0)).toBe(false);
  });

  it('tasa de ahorro', () => {
    const t = totals([tx({ type: 'income', amountCents: 500000 }), tx({ amountCents: 400000 })], CAD_ONLY);
    expect(t.savingsRate).toBeCloseTo(0.2);
    expect(totals([tx({})], CAD_ONLY).savingsRate).toBeNull();
  });

  it('las transferencias no cuentan como gasto ni ingreso', () => {
    const t = totals([tx({ type: 'transfer', amountCents: 99999 }), tx({ amountCents: 100 })], CAD_ONLY);
    expect(t.expenseCents).toBe(100);
    expect(t.count).toBe(1);
  });

  it('convierte USD a CAD con el tipo de cambio guardado', () => {
    const t = totals([tx({ currency: 'USD', amountCents: 10000 }), tx({ amountCents: 500 })], WITH_USD);
    expect(t.expenseCents).toBe(14000 + 500);
    expect(t.unconverted).toBe(0);
  });

  it('sin tipo de cambio NO inventa uno: excluye y avisa', () => {
    const txs = [tx({ currency: 'USD', amountCents: 10000 }), tx({ amountCents: 500 })];
    const t = totals(txs, CAD_ONLY);
    expect(t.expenseCents).toBe(500);
    expect(t.unconverted).toBe(1);
    expect(missingRates(txs, CAD_ONLY)).toEqual(['USD']);
  });
});

describe('series y agrupaciones', () => {
  const txs = [
    tx({ date: '2026-10-31', amountCents: 100 }),
    tx({ date: '2026-11-01', amountCents: 200 }),
    tx({ date: '2026-11-01', type: 'income', amountCents: 1000 }),
    tx({ date: '2026-09-15', amountCents: 50, categoryId: 'cat-dining' }),
  ];

  it('inMonth', () => {
    expect(inMonth(txs, '2026-11')).toHaveLength(2);
  });

  it('monthlySeries incluye meses vacíos', () => {
    const s = monthlySeries(txs, '2026-11', 4, CAD_ONLY);
    expect(s.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(s.map((p) => p.expenseCents)).toEqual([0, 50, 100, 200]);
  });

  it('byCategory ordena de mayor a menor con su porcentaje', () => {
    const c = byCategory(txs, CAD_ONLY);
    expect(c[0]).toEqual({ categoryId: 'cat-groceries', cents: 300, share: 300 / 350 });
    expect(c[1]?.categoryId).toBe('cat-dining');
  });

  it('groupByDay ordena del día más reciente al más viejo con su neto', () => {
    const g = groupByDay(txs, CAD_ONLY);
    expect(g.map((d) => d.date)).toEqual(['2026-11-01', '2026-10-31', '2026-09-15']);
    expect(g[0]?.netCents).toBe(800);
  });

  it('categoryUsage cuenta solo desde la fecha dada', () => {
    const u = categoryUsage(txs, '2026-10-01');
    expect(u.get('cat-groceries')).toBe(3);
    expect(u.has('cat-dining')).toBe(false);
  });
});

describe('delta', () => {
  it('calcula el cambio relativo', () => {
    expect(delta(130, 100)).toEqual({ pct: 0.3, direction: 'up' });
    expect(delta(70, 100)?.direction).toBe('down');
    expect(delta(100, 100)?.direction).toBe('flat');
    expect(delta(100, 0)).toBeNull();
  });
});
