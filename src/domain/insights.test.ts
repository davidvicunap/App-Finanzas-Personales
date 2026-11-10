import { describe, expect, it } from 'vitest';
import { buildInsights, recentAverages, topAction, weekSummary, type InsightInput } from './insights';
import { CAD_ONLY, tx } from '../test/factories';

const base = (p: Partial<InsightInput>): InsightInput => ({
  transactions: [],
  month: '2026-11',
  today: '2026-11-20',
  fx: CAD_ONLY,
  envelopes: [],
  recurring: [],
  goals: [],
  accountValues: [],
  holdings: [],
  missingCurrencies: [],
  ...p,
});

describe('insights', () => {
  it('"gastaste 50 % más en restaurantes que tu promedio"', () => {
    const txs = [
      ...['2026-08-10', '2026-09-10', '2026-10-10'].map((date) => tx({ date, categoryId: 'cat-dining', amountCents: 20_000 })),
      tx({ date: '2026-11-05', categoryId: 'cat-dining', amountCents: 30_000 }),
    ];
    const ins = buildInsights(base({ transactions: txs }));
    const up = ins.find((i) => i.code === 'category_up');
    expect(up?.params).toMatchObject({ category: 'cat-dining', pct: 50, avg: 20_000, diff: 10_000 });
  });

  it('no compara categorías con poca historia ni diferencias pequeñas', () => {
    const txs = [tx({ date: '2026-10-10', categoryId: 'cat-dining', amountCents: 1000 }), tx({ date: '2026-11-05', categoryId: 'cat-dining', amountCents: 9000 })];
    expect(buildInsights(base({ transactions: txs })).some((i) => i.code === 'category_up')).toBe(false);
  });

  it('flujo negativo es una alerta y va primero, con su acción', () => {
    const txs = [tx({ type: 'income', amountCents: 100_000 }), tx({ amountCents: 150_000 })];
    const ins = buildInsights(base({ transactions: txs, missingCurrencies: [] }));
    expect(ins[0]?.code).toBe('negative_cashflow');
    expect(ins[0]?.params.amount).toBe(50_000);
    expect(topAction(ins)?.action).toBe('transactions');
  });

  it('presupuesto pasado', () => {
    const ins = buildInsights(base({ transactions: [tx({})], envelopes: [{ categoryId: 'cat-dining', budgetCents: 100, spentCents: 150, remainingCents: -50, ratio: 1.5, status: 'over' }] }));
    expect(ins.find((i) => i.code === 'budget_over')?.params.amount).toBe(50);
  });

  it('sin movimientos sugiere registrar', () => {
    expect(buildInsights(base({}))[0]?.code).toBe('no_data');
  });
});

describe('resumen semanal y promedios', () => {
  it('últimos 7 días vs. los 7 anteriores', () => {
    const txs = [
      tx({ date: '2026-11-20', amountCents: 3000, categoryId: 'cat-dining' }),
      tx({ date: '2026-11-14', amountCents: 1000 }),
      tx({ date: '2026-11-13', amountCents: 2000 }), // semana anterior
    ];
    const w = weekSummary(txs, '2026-11-20', CAD_ONLY);
    expect(w).toMatchObject({ spentCents: 4000, previousCents: 2000, changeRatio: 1, topCategoryId: 'cat-dining', count: 2 });
  });

  it('promedio de meses completos con datos', () => {
    const txs = [tx({ date: '2026-10-05', amountCents: 1000 }), tx({ date: '2026-09-05', amountCents: 3000 }), tx({ date: '2026-11-05', amountCents: 99_999 })];
    expect(recentAverages(txs, '2026-11-20', CAD_ONLY)).toMatchObject({ monthsWithData: 2, expenseCents: 2000 });
  });
});
