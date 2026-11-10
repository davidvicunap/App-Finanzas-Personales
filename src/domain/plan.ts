/**
 * PLAN: PRESUPUESTO Y METAS
 * =========================
 * Dos métodos de presupuesto (eliges uno en la pantalla Plan):
 *  - Sobres: un límite mensual por categoría.
 *  - 50/30/20: de tus ingresos, 50 % necesidades, 30 % deseos y 20 % ahorro.
 *    Cada categoría de gasto está marcada como necesidad o deseo.
 */
import { mulDivCents, sumCents, type Cents } from './money';
import { daysInMonth, monthOf, monthsBetween, type LocalDate, type YearMonth } from './dates';
import { toBase, type FxSettings } from './stats';
import type { Budget, Category, Goal, Id, Transaction } from './types';

/* ------------------------------ Sobres ------------------------------ */

export type EnvelopeStatus = 'ok' | 'warning' | 'over';

export interface Envelope {
  categoryId: Id;
  budgetCents: Cents;
  spentCents: Cents;
  /** Puede ser negativo si te pasaste. */
  remainingCents: Cents;
  /** spent / budget (1 = 100 %). */
  ratio: number;
  status: EnvelopeStatus;
}

/** Gasto por categoría en moneda base (solo gastos). */
export function spentByCategory(monthTx: readonly Transaction[], fx: FxSettings): Map<Id, Cents> {
  const map = new Map<Id, Cents>();
  for (const t of monthTx) {
    if (t.type !== 'expense' || !t.categoryId) continue;
    const v = toBase(t, fx);
    if (v !== null) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + v);
  }
  return map;
}

/**
 * Estado de cada sobre. "warning" si gastaste ≥ 90 %, o si vas más rápido
 * que el mes (ej. 80 % del sobre cuando solo ha pasado 40 % del mes).
 */
export function envelopes(
  budgets: readonly Budget[],
  monthTx: readonly Transaction[],
  fx: FxSettings,
  monthProgress = 1,
): Envelope[] {
  const spent = spentByCategory(monthTx, fx);
  return budgets
    .filter((b) => b.monthlyCents > 0)
    .map((b) => {
      const spentCents = spent.get(b.categoryId) ?? 0;
      const ratio = spentCents / b.monthlyCents;
      const status: EnvelopeStatus =
        ratio > 1 ? 'over' : ratio >= 0.9 || (monthProgress < 1 && ratio > monthProgress + 0.25) ? 'warning' : 'ok';
      return { categoryId: b.categoryId, budgetCents: b.monthlyCents, spentCents, remainingCents: b.monthlyCents - spentCents, ratio, status };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Fracción del mes transcurrida (0–1) a la fecha `today`. Meses pasados = 1. */
export function monthProgress(month: YearMonth, today: LocalDate): number {
  const current = monthOf(today);
  if (month < current) return 1;
  if (month > current) return 0;
  return Number(today.slice(8, 10)) / daysInMonth(month);
}

/* ----------------------------- 50/30/20 ----------------------------- */

export interface Bucket {
  actualCents: Cents;
  targetCents: Cents;
}

export interface FiftyThirtyTwenty {
  incomeCents: Cents;
  needs: Bucket;
  wants: Bucket;
  /** Ahorro = ingresos − necesidades − deseos. */
  savings: Bucket;
}

/** Las categorías sin clasificar cuentan como "deseos" (supuesto conservador). */
export function fiftyThirtyTwenty(
  monthTx: readonly Transaction[],
  categories: readonly Category[],
  fx: FxSettings,
): FiftyThirtyTwenty {
  const groupOf = new Map(categories.map((c) => [c.id, c.group]));
  const income: Cents[] = [];
  const needs: Cents[] = [];
  const wants: Cents[] = [];
  for (const t of monthTx) {
    const v = toBase(t, fx);
    if (v === null || t.type === 'transfer') continue;
    if (t.type === 'income') income.push(v);
    else if (t.categoryId && groupOf.get(t.categoryId) === 'needs') needs.push(v);
    else wants.push(v);
  }
  const incomeCents = sumCents(income);
  const needsCents = sumCents(needs);
  const wantsCents = sumCents(wants);
  return {
    incomeCents,
    needs: { actualCents: needsCents, targetCents: mulDivCents(incomeCents, 50, 100) },
    wants: { actualCents: wantsCents, targetCents: mulDivCents(incomeCents, 30, 100) },
    savings: { actualCents: incomeCents - needsCents - wantsCents, targetCents: mulDivCents(incomeCents, 20, 100) },
  };
}

/* ------------------------------- Metas ------------------------------- */

export interface GoalProgress {
  goal: Goal;
  savedCents: Cents;
  remainingCents: Cents;
  /** 0–1 (se limita a 1). */
  ratio: number;
  done: boolean;
  /** Meses hasta la fecha objetivo (mínimo 1). null si no hay fecha. */
  monthsLeft: number | null;
  /** Cuánto ahorrar al mes para llegar a tiempo. null si no hay fecha o ya está lista. */
  monthlyNeededCents: Cents | null;
}

/**
 * @param linkedValue Valor actual (moneda base) de la cuenta vinculada, si la meta tiene una.
 */
export function goalProgress(goal: Goal, today: LocalDate, linkedValue: Cents | null = null): GoalProgress {
  const savedCents = Math.max(0, goal.accountId ? (linkedValue ?? 0) : goal.savedCents);
  const remainingCents = Math.max(0, goal.targetCents - savedCents);
  const done = goal.targetCents > 0 && remainingCents === 0;
  const monthsLeft = goal.targetDate ? Math.max(1, monthsBetween(monthOf(today), monthOf(goal.targetDate))) : null;
  return {
    goal,
    savedCents,
    remainingCents,
    ratio: goal.targetCents > 0 ? Math.min(1, savedCents / goal.targetCents) : 0,
    done,
    monthsLeft,
    // Se redondea hacia arriba al centavo: mejor ahorrar un centavo de más que quedarse corto.
    monthlyNeededCents: monthsLeft && !done ? Math.ceil(remainingCents / monthsLeft) : null,
  };
}
