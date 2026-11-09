/**
 * GASTOS RECURRENTES Y SUSCRIPCIONES (detección automática)
 * =========================================================
 * Un gasto se considera recurrente si:
 *  - tiene la misma categoría y una nota parecida ("Netflix", "netflix 11/26"),
 *  - aparece en al menos 3 meses distintos de los últimos 6,
 *  - casi siempre una vez por mes,
 *  - y su monto no varía más de ±20 % respecto a la mediana.
 *
 * Por eso conviene escribir una nota al registrar (ej. "Netflix", "Rogers").
 */
import { sumCents, type Cents, type CurrencyCode } from './money';
import { addMonths, monthOf, shiftMonth, type LocalDate } from './dates';
import { toBase, type FxSettings } from './stats';
import type { Id, Transaction } from './types';

export interface RecurringItem {
  /** Identificador estable: categoría + nota normalizada. */
  key: string;
  categoryId: Id | null;
  /** Nota original del último movimiento (para mostrar). */
  label: string;
  /** Último monto, en su moneda. */
  amountCents: Cents;
  currency: CurrencyCode;
  /** Último monto en moneda base (null si falta tipo de cambio). */
  baseCents: Cents | null;
  months: number;
  lastDate: LocalDate;
  /** Fecha estimada del próximo cargo. */
  nextDate: LocalDate;
  /** Cambio del último monto vs. el anterior (0.1 = +10 %). null si igual o no aplica. */
  changeRatio: number | null;
}

/** "Netflix 11/26 #123" → "netflix". Quita números, signos y espacios repetidos. */
export function normalizeNote(note: string): string {
  return note
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function detectRecurring(
  txs: readonly Transaction[],
  today: LocalDate,
  fx: FxSettings,
  dismissed: readonly string[] = [],
): RecurringItem[] {
  const since = `${shiftMonth(monthOf(today), -6)}-01`;
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.type !== 'expense' || t.date < since || t.date > today) continue;
    const note = normalizeNote(t.note);
    if (note.length < 2) continue; // sin nota no hay forma fiable de agrupar
    const key = `${t.categoryId ?? ''}|${note}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const items: RecurringItem[] = [];
  for (const [key, list] of groups) {
    if (dismissed.includes(key)) continue;
    const months = new Set(list.map((t) => monthOf(t.date)));
    if (months.size < 3) continue;
    if (list.length > months.size * 1.5) continue; // demasiados por mes: no es una suscripción
    const amounts = list.map((t) => t.amountCents);
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) > med * 0.2)) continue;

    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const last = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    const change = prev.amountCents > 0 ? (last.amountCents - prev.amountCents) / prev.amountCents : 0;
    items.push({
      key,
      categoryId: last.categoryId,
      label: last.note.trim(),
      amountCents: last.amountCents,
      currency: last.currency,
      baseCents: toBase(last, fx),
      months: months.size,
      lastDate: last.date,
      nextDate: addMonths(last.date, 1),
      changeRatio: Math.abs(change) >= 0.01 ? change : null,
    });
  }
  return items.sort((a, b) => (b.baseCents ?? 0) - (a.baseCents ?? 0));
}

/** Total mensual de los recurrentes (moneda base). */
export function recurringMonthlyTotal(items: readonly RecurringItem[]): Cents {
  return sumCents(items.map((i) => i.baseCents ?? 0));
}
