import { describe, expect, it } from 'vitest';
import { envelopes, fiftyThirtyTwenty, goalProgress, monthProgress } from './plan';
import { defaultCategories } from './defaults';
import { CAD_ONLY, goal, tx } from '../test/factories';

describe('sobres', () => {
  const txs = [tx({ categoryId: 'cat-dining', amountCents: 25_000 }), tx({ categoryId: 'cat-groceries', amountCents: 30_000 }), tx({ categoryId: 'cat-travel', amountCents: 9_000 })];
  const budgets = [
    { id: 'cat-dining', categoryId: 'cat-dining', monthlyCents: 20_000 },
    { id: 'cat-groceries', categoryId: 'cat-groceries', monthlyCents: 80_000 },
    { id: 'cat-travel', categoryId: 'cat-travel', monthlyCents: 10_000 },
  ];
  it('estado: pasado, cerca y bien', () => {
    const e = envelopes(budgets, txs, CAD_ONLY);
    expect(e.map((x) => [x.categoryId, x.status, x.remainingCents])).toEqual([
      ['cat-dining', 'over', -5_000],
      ['cat-travel', 'warning', 1_000],
      ['cat-groceries', 'ok', 50_000],
    ]);
  });
  it('avisa si vas más rápido que el mes', () => {
    // 37.5 % del sobre de supermercado con solo 10 % del mes → ok; 90 % del mes lo marca de otra forma
    const e = envelopes(budgets, txs, CAD_ONLY, 0.1);
    expect(e.find((x) => x.categoryId === 'cat-groceries')?.status).toBe('warning');
  });
  it('monthProgress', () => {
    expect(monthProgress('2026-11', '2026-11-15')).toBe(0.5);
    expect(monthProgress('2026-10', '2026-11-15')).toBe(1);
  });
});

describe('50/30/20', () => {
  it('reparte gastos según la clasificación de cada categoría', () => {
    const txs = [
      tx({ type: 'income', categoryId: 'cat-salary', amountCents: 600_000 }),
      tx({ categoryId: 'cat-housing', amountCents: 250_000 }), // necesidad
      tx({ categoryId: 'cat-dining', amountCents: 100_000 }), // deseo
      tx({ categoryId: null, amountCents: 50_000 }), // sin categoría → deseo
    ];
    const r = fiftyThirtyTwenty(txs, defaultCategories(), CAD_ONLY);
    expect(r.needs).toEqual({ actualCents: 250_000, targetCents: 300_000 });
    expect(r.wants).toEqual({ actualCents: 150_000, targetCents: 180_000 });
    expect(r.savings).toEqual({ actualCents: 200_000, targetCents: 120_000 });
  });
});

describe('metas', () => {
  it('calcula cuánto ahorrar al mes para llegar a tiempo', () => {
    const p = goalProgress(goal({ targetCents: 1_000_000, savedCents: 400_000, targetDate: '2027-11-01' }), '2026-11-09');
    expect(p.monthsLeft).toBe(12);
    expect(p.monthlyNeededCents).toBe(50_000);
    expect(p.ratio).toBeCloseTo(0.4);
  });
  it('redondea hacia arriba (mejor un centavo de más)', () => {
    const p = goalProgress(goal({ targetCents: 1000, savedCents: 0, targetDate: '2027-02-01' }), '2026-11-09');
    expect(p.monthlyNeededCents).toBe(334);
  });
  it('vinculada a una cuenta usa el saldo de la cuenta', () => {
    const p = goalProgress(goal({ targetCents: 100_000, accountId: 'x' }), '2026-11-09', 120_000);
    expect(p).toMatchObject({ done: true, ratio: 1, remainingCents: 0, monthlyNeededCents: null });
  });
});
