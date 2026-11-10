/**
 * FECHAS
 * ======
 * Un movimiento ocurre en un DÍA del calendario ("2026-11-09"), no en un
 * instante. Por eso las fechas se guardan como texto 'YYYY-MM-DD' y los meses
 * como 'YYYY-MM'.
 *
 * Trampa que evitamos: `new Date('2026-11-01')` se interpreta como medianoche
 * en UTC (Londres). En Vancouver (UTC-8) eso es el 31 de octubre a las 4 p. m.,
 * y la app mostraba el mes equivocado. Aquí todo cálculo se hace con números
 * (año, mes, día) y, para formatear, con timeZone 'UTC' de forma explícita.
 */

/** Fecha de calendario 'YYYY-MM-DD'. */
export type LocalDate = string;
/** Mes 'YYYY-MM'. */
export type YearMonth = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Comprobar que el día existe (rechaza 2026-02-30).
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isYearMonth(value: unknown): value is YearMonth {
  if (typeof value !== 'string') return false;
  const m = YM_RE.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** Hoy, según el reloj y la zona horaria del dispositivo. */
export function today(now: Date = new Date()): LocalDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return today(now).slice(0, 7);
}

export function monthOf(date: LocalDate): YearMonth {
  return date.slice(0, 7);
}

function parts(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Fecha inválida: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Suma (o resta) días a una fecha. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Mueve un mes hacia adelante o atrás: shiftMonth('2026-01', -1) → '2025-12'. */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const m = YM_RE.exec(ym);
  if (!m) throw new Error(`Mes inválido: ${ym}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Los últimos `n` meses terminando en `end` (incluido), del más viejo al más nuevo. */
export function lastMonths(end: YearMonth, n: number): YearMonth[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - (n - 1)));
}

/** Convierte a Date en UTC, SOLO para formatear con timeZone: 'UTC'. */
function utcDate(date: LocalDate): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "noviembre de 2026" / "November 2026" */
export function formatMonth(ym: YearMonth, locale: string, style: 'long' | 'short' = 'long'): string {
  const d = utcDate(`${ym}-01`);
  if (style === 'short') {
    return d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }).replace('.', '');
  }
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "lunes, 9 nov" / "Monday, Nov 9" */
export function formatDay(date: LocalDate, locale: string): string {
  return utcDate(date)
    .toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

/** Días que tiene un mes: daysInMonth('2028-02') → 29. */
export function daysInMonth(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Suma meses a una fecha, ajustando al último día si el mes es más corto:
 * addMonths('2026-01-31', 1) → '2026-02-28'.
 */
export function addMonths(date: LocalDate, n: number): LocalDate {
  const ym = shiftMonth(monthOf(date), n);
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(ym));
  return `${ym}-${pad(day)}`;
}

/** Meses completos entre dos meses: monthsBetween('2026-11', '2027-02') → 3. */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  const [y1, m1] = from.split('-').map(Number) as [number, number];
  const [y2, m2] = to.split('-').map(Number) as [number, number];
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Días entre dos fechas (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
