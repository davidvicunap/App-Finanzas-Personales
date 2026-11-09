/**
 * CÁLCULOS DEL DASHBOARD
 * ======================
 * Funciones puras: reciben movimientos y devuelven números. No tocan la
 * pantalla ni la base de datos, así que son fáciles de probar.
 *
 * Todos los totales se expresan en la MONEDA BASE (CAD por defecto). Un
 * movimiento en otra moneda se convierte con el tipo de cambio guardado; si no
 * hay tipo de cambio, NO se inventa uno: se excluye y se cuenta en `unconverted`
 * para que la pantalla pueda avisar.
 */
import { convertCents, sumCents, type Cents, type CurrencyCode } from './money';
import { lastMonths, monthOf, type LocalDate, type YearMonth } from './dates';
import type { Id, Settings, Transaction } from './types';

export type FxSettings = Pick<Settings, 'baseCurrency' | 'fxRates'>;

/** Monto del movimiento en moneda base, o null si falta el tipo de cambio. */
export function toBase(tx: Pick<Transaction, 'amountCents' | 'currency'>, fx: FxSettings): Cents | null {
  if (tx.currency === fx.baseCurrency) return tx.amountCents;
  const rate = fx.fxRates[tx.currency];
  return rate ? convertCents(tx.amountCents, rate.rateMicros) : null;
}

/** Monedas usadas por movimientos que no se pueden convertir. */
export function missingRates(txs: readonly Transaction[], fx: FxSettings): CurrencyCode[] {
  const out = new Set<CurrencyCode>();
  for (const t of txs) if (t.currency !== fx.baseCurrency && !fx.fxRates[t.currency]) out.add(t.currency);
  return [...out];
}

export interface Totals {
  incomeCents: Cents;
  expenseCents: Cents;
  /** Ingresos − gastos. Positivo = ahorraste. */
  netCents: Cents;
  /** Ahorro / ingresos (0.25 = 25 %). null si no hubo ingresos. */
  savingsRate: number | null;
  count: number;
  /** Movimientos excluidos por no tener tipo de cambio. */
  unconverted: number;
}

export function totals(txs: readonly Transaction[], fx: FxSettings): Totals {
  const income: Cents[] = [];
  const expense: Cents[] = [];
  let unconverted = 0;
  let count = 0;
  for (const t of txs) {
    if (t.type === 'transfer') continue; // mover dinero entre tus cuentas no es gastar
    count++;
    const v = toBase(t, fx);
    if (v === null) {
      unconverted++;
      continue;
    }
    (t.type === 'income' ? income : expense).push(v);
  }
  const incomeCents = sumCents(income);
  const expenseCents = sumCents(expense);
  const netCents = incomeCents - expenseCents;
  return {
    incomeCents,
    expenseCents,
    netCents,
    savingsRate: incomeCents > 0 ? netCents / incomeCents : null,
    count,
    unconverted,
  };
}

export function inMonth(txs: readonly Transaction[], ym: YearMonth): Transaction[] {
  return txs.filter((t) => monthOf(t.date) === ym);
}

export interface MonthPoint extends Totals {
  month: YearMonth;
}

/** Totales de los últimos `n` meses que terminan en `end`. */
export function monthlySeries(txs: readonly Transaction[], end: YearMonth, n: number, fx: FxSettings): MonthPoint[] {
  const byMonth = new Map<YearMonth, Transaction[]>();
  for (const t of txs) {
    const m = monthOf(t.date);
    const list = byMonth.get(m);
    if (list) list.push(t);
    else byMonth.set(m, [t]);
  }
  return lastMonths(end, n).map((month) => ({ month, ...totals(byMonth.get(month) ?? [], fx) }));
}

export interface CategorySlice {
  categoryId: Id | null;
  cents: Cents;
  /** Fracción del total (0–1). */
  share: number;
}

/** Gasto por categoría, de mayor a menor. */
export function byCategory(txs: readonly Transaction[], fx: FxSettings, kind: 'income' | 'expense' = 'expense'): CategorySlice[] {
  const map = new Map<Id | null, Cents>();
  for (const t of txs) {
    if (t.type !== kind) continue;
    const v = toBase(t, fx);
    if (v === null) continue;
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + v);
  }
  const total = sumCents([...map.values()]);
  return [...map.entries()]
    .map(([categoryId, cents]) => ({ categoryId, cents, share: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

export interface Delta {
  /** Cambio relativo: 0.3 = +30 %. */
  pct: number;
  direction: 'up' | 'down' | 'flat';
}

/** Cambio de `prev` a `cur`. null si no hay base de comparación (prev = 0). */
export function delta(cur: Cents, prev: Cents): Delta | null {
  if (prev === 0) return null;
  const pct = (cur - prev) / Math.abs(prev);
  return { pct, direction: Math.abs(pct) < 0.005 ? 'flat' : pct > 0 ? 'up' : 'down' };
}

export interface DayGroup {
  date: LocalDate;
  /** Neto del día (ingresos − gastos) en moneda base. */
  netCents: Cents;
  items: Transaction[];
}

/** Agrupa por día, del más reciente al más antiguo. */
export function groupByDay(txs: readonly Transaction[], fx: FxSettings): DayGroup[] {
  const map = new Map<LocalDate, Transaction[]>();
  for (const t of txs) {
    const list = map.get(t.date);
    if (list) list.push(t);
    else map.set(t.date, [t]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      netCents: totals(items, fx).netCents,
      items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
}

/**
 * Categorías ordenadas por uso reciente: las que más usas aparecen primero
 * al registrar un gasto (menos toques = registro en menos de 5 segundos).
 */
export function categoryUsage(txs: readonly Transaction[], since: LocalDate): Map<Id, number> {
  const usage = new Map<Id, number>();
  for (const t of txs) {
    if (t.categoryId && t.date >= since) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);
  }
  return usage;
}
