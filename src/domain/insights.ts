/**
 * INSIGHTS: QUÉ CAMBIÓ, ALERTAS Y UNA ACCIÓN SUGERIDA
 * ===================================================
 * Reglas simples y transparentes (sin IA ni datos externos). Cada insight trae
 * un código y sus valores; la pantalla lo traduce (i18n: "insight.<código>").
 *
 * Las acciones sugeridas son de ORGANIZACIÓN ("revisa", "actualiza"), nunca
 * de inversión: la app muestra datos y cálculos, las decisiones son tuyas.
 */
import { sumCents, type Cents } from './money';
import { addDays, monthOf, shiftMonth, type LocalDate, type YearMonth } from './dates';
import { inMonth, toBase, totals, type FxSettings } from './stats';
import type { Envelope } from './plan';
import type { GoalProgress } from './plan';
import type { RecurringItem } from './recurring';
import type { AccountValue } from './wealth';
import type { Holding, Id, Transaction } from './types';

export type Severity = 'alert' | 'warning' | 'info' | 'good';

export type InsightCode =
  | 'missing_fx'
  | 'negative_cashflow'
  | 'budget_over'
  | 'budget_near'
  | 'category_up'
  | 'category_down'
  | 'savings_up'
  | 'savings_down'
  | 'recurring_up'
  | 'recurring_total'
  | 'goal_behind'
  | 'goal_done'
  | 'stale_balances'
  | 'stale_prices'
  | 'no_data';

/** A qué pantalla lleva la acción sugerida. */
export type ActionTarget = 'transactions' | 'plan' | 'wealth' | 'settings';

export interface Insight {
  code: InsightCode;
  severity: Severity;
  /** Valores para el texto: montos en centavos, porcentajes enteros, ids… */
  params: Record<string, string | number>;
  /** Para montos: qué parámetros son centavos (la pantalla los formatea). */
  moneyParams?: string[];
  /** Para categorías: qué parámetro es un id de categoría. */
  categoryParam?: string;
  action: ActionTarget | null;
}

export interface InsightInput {
  transactions: readonly Transaction[];
  month: YearMonth;
  today: LocalDate;
  fx: FxSettings;
  envelopes: readonly Envelope[];
  recurring: readonly RecurringItem[];
  goals: readonly GoalProgress[];
  accountValues: readonly AccountValue[];
  holdings: readonly Holding[];
  missingCurrencies: readonly string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { alert: 0, warning: 1, info: 2, good: 3 };
/** Diferencia mínima para que un cambio por categoría sea relevante: $50. */
const MIN_CATEGORY_DIFF = 5000;

/** Gasto por categoría (moneda base) de un conjunto de movimientos. */
function expenseByCategory(txs: readonly Transaction[], fx: FxSettings): Map<Id, Cents> {
  const map = new Map<Id, Cents>();
  for (const t of txs) {
    if (t.type !== 'expense' || !t.categoryId) continue;
    const v = toBase(t, fx);
    if (v !== null) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + v);
  }
  return map;
}

/** Promedio mensual de gasto por categoría en los `n` meses anteriores a `month`. */
export function categoryAverages(txs: readonly Transaction[], month: YearMonth, fx: FxSettings, n = 3) {
  const perMonth = Array.from({ length: n }, (_, i) => expenseByCategory(inMonth(txs, shiftMonth(month, -(i + 1))), fx));
  const avg = new Map<Id, { avgCents: Cents; monthsWithSpend: number }>();
  const ids = new Set(perMonth.flatMap((m) => [...m.keys()]));
  for (const id of ids) {
    const values = perMonth.map((m) => m.get(id) ?? 0);
    avg.set(id, { avgCents: Math.round(sumCents(values) / n), monthsWithSpend: values.filter((v) => v > 0).length });
  }
  return avg;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { transactions, month, today, fx } = input;
  const out: Insight[] = [];
  const monthTx = inMonth(transactions, month);
  const isPast = month < monthOf(today);

  if (input.missingCurrencies.length) {
    out.push({ code: 'missing_fx', severity: 'alert', params: { currencies: input.missingCurrencies.join(', ') }, action: 'settings' });
  }

  if (monthTx.length === 0) {
    out.push({ code: 'no_data', severity: 'info', params: {}, action: 'transactions' });
  }

  const cur = totals(monthTx, fx);
  const prev = totals(inMonth(transactions, shiftMonth(month, -1)), fx);
  if (cur.incomeCents > 0 && cur.netCents < 0) {
    out.push({ code: 'negative_cashflow', severity: 'alert', params: { amount: -cur.netCents }, moneyParams: ['amount'], action: 'transactions' });
  }

  // Presupuestos
  for (const e of input.envelopes) {
    if (e.status === 'over') {
      out.push({ code: 'budget_over', severity: 'alert', params: { category: e.categoryId, amount: -e.remainingCents }, moneyParams: ['amount'], categoryParam: 'category', action: 'plan' });
    } else if (e.status === 'warning' && !isPast) {
      out.push({ code: 'budget_near', severity: 'warning', params: { category: e.categoryId, pct: Math.trunc(e.ratio * 100) }, categoryParam: 'category', action: 'plan' });
    }
  }

  // Categorías vs. su promedio de 3 meses
  const avgs = categoryAverages(transactions, month, fx);
  const now = expenseByCategory(monthTx, fx);
  const ups: Insight[] = [];
  const downs: Insight[] = [];
  for (const [id, { avgCents, monthsWithSpend }] of avgs) {
    if (monthsWithSpend < 2 || avgCents <= 0) continue; // poca historia: no comparar
    const c = now.get(id) ?? 0;
    const diff = c - avgCents;
    const pct = Math.trunc((diff / avgCents) * 100);
    if (pct >= 30 && diff >= MIN_CATEGORY_DIFF) {
      ups.push({ code: 'category_up', severity: 'warning', params: { category: id, pct, avg: avgCents, diff }, moneyParams: ['avg', 'diff'], categoryParam: 'category', action: 'transactions' });
    } else if (isPast && pct <= -30 && -diff >= MIN_CATEGORY_DIFF) {
      downs.push({ code: 'category_down', severity: 'good', params: { category: id, pct: -pct, diff: -diff }, moneyParams: ['diff'], categoryParam: 'category', action: null });
    }
  }
  const byDiff = (a: Insight, b: Insight) => Number(b.params.diff) - Number(a.params.diff);
  out.push(...ups.sort(byDiff).slice(0, 2), ...downs.sort(byDiff).slice(0, 2));

  // Tasa de ahorro vs. mes anterior (solo con mes cerrado o mes anterior completo)
  if (cur.savingsRate !== null && prev.savingsRate !== null && isPast) {
    const delta = Math.trunc((cur.savingsRate - prev.savingsRate) * 100);
    if (delta >= 5) out.push({ code: 'savings_up', severity: 'good', params: { points: delta, pct: Math.trunc(cur.savingsRate * 100) }, action: null });
    if (delta <= -5) out.push({ code: 'savings_down', severity: 'warning', params: { points: -delta, pct: Math.trunc(cur.savingsRate * 100) }, action: 'transactions' });
  }

  // Recurrentes
  for (const r of input.recurring) {
    if (r.changeRatio !== null && r.changeRatio >= 0.05) {
      out.push({ code: 'recurring_up', severity: 'warning', params: { name: r.label, pct: Math.trunc(r.changeRatio * 100), amount: r.amountCents }, moneyParams: ['amount'], action: 'plan' });
    }
  }
  if (input.recurring.length) {
    const total = sumCents(input.recurring.map((r) => r.baseCents ?? 0));
    out.push({ code: 'recurring_total', severity: 'info', params: { n: input.recurring.length, amount: total }, moneyParams: ['amount'], action: 'plan' });
  }

  // Metas
  const avgSavings = Math.round(
    sumCents([1, 2, 3].map((i) => totals(inMonth(transactions, shiftMonth(monthOf(today), -i)), fx).netCents)) / 3,
  );
  for (const g of input.goals) {
    if (g.goal.archived) continue;
    if (g.done) out.push({ code: 'goal_done', severity: 'good', params: { name: g.goal.name }, action: 'plan' });
    else if (g.monthlyNeededCents !== null && avgSavings > 0 && g.monthlyNeededCents > avgSavings) {
      out.push({ code: 'goal_behind', severity: 'warning', params: { name: g.goal.name, needed: g.monthlyNeededCents, avg: avgSavings }, moneyParams: ['needed', 'avg'], action: 'plan' });
    }
  }

  // Datos viejos: saldos de más de 35 días, precios de más de 7 días
  const staleBefore = addDays(today, -35);
  const stale = input.accountValues.filter((v) => !v.account.archived && v.source === 'balance' && v.asOf !== null && v.asOf < staleBefore);
  if (stale.length) out.push({ code: 'stale_balances', severity: 'info', params: { n: stale.length }, action: 'wealth' });
  const oldPrices = input.holdings.filter((h) => h.assetClass !== 'cash' && h.priceAsOf < addDays(today, -7));
  if (oldPrices.length) out.push({ code: 'stale_prices', severity: 'info', params: { n: oldPrices.length }, action: 'wealth' });

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** La acción más importante: la del primer insight (ya ordenados) que tenga acción. */
export function topAction(insights: readonly Insight[]): Insight | null {
  return insights.find((i) => i.action !== null && i.severity !== 'good') ?? null;
}

/* --------------------------- Resumen semanal --------------------------- */

export interface WeekSummary {
  spentCents: Cents;
  previousCents: Cents;
  /** Cambio vs. los 7 días anteriores. null si no hubo gasto antes. */
  changeRatio: number | null;
  topCategoryId: Id | null;
  topCategoryCents: Cents;
  count: number;
}

/** Últimos 7 días (incluido hoy) vs. los 7 anteriores. */
export function weekSummary(txs: readonly Transaction[], today: LocalDate, fx: FxSettings): WeekSummary {
  const start = addDays(today, -6);
  const prevStart = addDays(today, -13);
  const week = txs.filter((t) => t.date >= start && t.date <= today);
  const prevWeek = txs.filter((t) => t.date >= prevStart && t.date < start);
  const spentCents = totals(week, fx).expenseCents;
  const previousCents = totals(prevWeek, fx).expenseCents;
  const byCat = expenseByCategory(week, fx);
  let topCategoryId: Id | null = null;
  let topCategoryCents = 0;
  for (const [id, c] of byCat) if (c > topCategoryCents) [topCategoryId, topCategoryCents] = [id, c];
  return {
    spentCents,
    previousCents,
    changeRatio: previousCents > 0 ? (spentCents - previousCents) / previousCents : null,
    topCategoryId,
    topCategoryCents,
    count: week.filter((t) => t.type === 'expense').length,
  };
}

/** Promedios de los últimos `n` meses completos (antes del mes actual). */
export function recentAverages(txs: readonly Transaction[], today: LocalDate, fx: FxSettings, n = 3) {
  const months = Array.from({ length: n }, (_, i) => totals(inMonth(txs, shiftMonth(monthOf(today), -(i + 1))), fx));
  const withData = months.filter((m) => m.count > 0);
  const k = Math.max(1, withData.length);
  return {
    monthsWithData: withData.length,
    expenseCents: Math.round(sumCents(withData.map((m) => m.expenseCents)) / k),
    incomeCents: Math.round(sumCents(withData.map((m) => m.incomeCents)) / k),
    savingsCents: Math.round(sumCents(withData.map((m) => m.netCents)) / k),
  };
}
