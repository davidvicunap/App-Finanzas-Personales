/**
 * DINERO
 * ======
 * Regla de oro de la app: los montos SIEMPRE se guardan como un número entero
 * de CENTAVOS, nunca como decimal.
 *
 * ¿Por qué? Los decimales de JavaScript (floats) no pueden representar 0.1
 * exactamente, así que 0.3 - 0.1 - 0.2 da -0.0000000000000000277 en vez de 0.
 * Con enteros, 30 - 10 - 20 da exactamente 0.
 *
 * Solo se divide entre 100 en el último momento: al MOSTRAR el número.
 */

export const CURRENCIES = ['CAD', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** Un número entero de centavos. Ej.: $12.50 → 1250. */
export type Cents = number;

export function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Lanza un error si `n` no es un entero seguro: protege contra bugs silenciosos. */
export function assertCents(n: number): Cents {
  if (!Number.isSafeInteger(n)) throw new Error(`Monto inválido (no es un entero de centavos): ${n}`);
  return n;
}

/** Suma exacta de una lista de centavos. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return assertCents(total);
}

/**
 * Convierte el texto que escribe una persona en centavos.
 * Acepta: "12", "12.5", "12,50", "1,234.56", "1 234,56", "$8", "US$ 3.20".
 * Devuelve `null` si el texto no es un monto válido (o tiene más de 2 decimales).
 *
 * No usa parseFloat: separa la parte entera y los decimales como texto,
 * así nunca pasa por un float.
 */
export function parseAmount(input: string): Cents | null {
  // Quitar espacios (incluido el espacio fino que usa el francés) y símbolos de moneda.
  const s = input.trim().replace(/[\s\u00a0\u202f]/g, '').replace(/^(US|CA|C)?\$/i, '').replace(/\$$/, '');
  if (s === '' || !/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    // Hay ambos: el que aparece al final es el separador decimal ("1,234.56" o "1.234,56").
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const after = parts[parts.length - 1] ?? '';
    // Una sola aparición seguida de 1-2 dígitos → decimal ("12,5", "12.50").
    // Grupos de exactamente 3 dígitos → miles ("1,234" o "1,234,567").
    // "1.234" es ambiguo (¿mil o uno coma dos?): lo rechazamos para no adivinar.
    if (parts.length === 2 && after.length <= 2) decimalSep = sep;
    else if (sep === ',' && parts.slice(1).every((p) => p.length === 3)) decimalSep = null;
    else return null;
  }

  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  const thousandsSep = decimalSep === '.' ? ',' : decimalSep === ',' ? '.' : /[.,]/;
  intPart = intPart.split(thousandsSep).join('');

  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  if (intPart === '' && fracPart === '') return null;
  // Más de 13 dígitos enteros (billones) no es un monto realista: lo rechazamos.
  if (intPart.length > 13) return null;

  const cents = Number(intPart || '0') * 100 + Number(fracPart.padEnd(2, '0'));
  return assertCents(cents);
}

/** Centavos → texto editable para un campo de formulario: 1250 → "12.50", 1200 → "12". */
export function centsToInput(cents: Cents): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return (cents < 0 ? '-' : '') + whole + (frac ? '.' + String(frac).padStart(2, '0') : '');
}

export interface FormatOptions {
  /** 'auto' oculta ".00" en montos enteros; 'always' siempre muestra centavos. */
  cents?: 'auto' | 'always' | 'never';
  /** 'always' antepone "+" a los positivos (útil para ingresos). */
  sign?: 'auto' | 'always';
  /** Formato corto: $1.2K, $3.4M. Para espacios pequeños. */
  compact?: boolean;
}

/**
 * Centavos → texto con moneda. Ej.: (123450, 'CAD') → "$1,234.50".
 *
 * Decisión de diseño: usamos SIEMPRE el formato canadiense en inglés (en-CA)
 * para los montos, también con la interfaz en español. Así los números se ven
 * igual que en los estados de cuenta de CIBC/Wealthsimple ($1,234.50) y el USD
 * se distingue claramente (US$1,234.50).
 */
export function formatMoney(cents: Cents, currency: CurrencyCode, opts: FormatOptions = {}): string {
  assertCents(cents);
  const isWhole = cents % 100 === 0;
  const showCents = opts.cents === 'always' || (opts.cents !== 'never' && !isWhole);
  const fmt = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    notation: opts.compact ? 'compact' : 'standard',
    minimumFractionDigits: opts.compact ? 0 : showCents ? 2 : 0,
    maximumFractionDigits: opts.compact ? 1 : showCents ? 2 : 0,
    signDisplay: opts.sign === 'always' ? 'exceptZero' : 'auto',
  });
  // Dividir entre 100 aquí es seguro: es solo para mostrar, no para calcular.
  return fmt.format(cents / 100);
}

/* ------------------------------------------------------------------
 * TIPOS DE CAMBIO
 * Un tipo de cambio se guarda como entero en "micro-unidades" (x 1,000,000).
 * Ej.: 1 USD = 1.3725 CAD → 1_372_500. Así la conversión también es entera.
 * ------------------------------------------------------------------ */

export type RateMicros = number;
const MICRO = 1_000_000n;

/** "1.3725" → 1372500. Devuelve null si no es un número positivo con ≤ 6 decimales. */
export function parseRate(input: string): RateMicros | null {
  const s = input.trim().replace(',', '.');
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const micros = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
  return micros > 0 ? micros : null;
}

export function formatRate(micros: RateMicros): string {
  const whole = Math.floor(micros / 1_000_000);
  const frac = String(micros % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac.padEnd(2, '0')}` : `${whole}`;
}

/**
 * Convierte centavos con un tipo de cambio, redondeando al centavo más cercano
 * (las mitades se alejan de cero, como en contabilidad).
 * Usa BigInt para que la multiplicación nunca pierda precisión.
 */
export function convertCents(cents: Cents, rate: RateMicros): Cents {
  assertCents(cents);
  const product = BigInt(cents) * BigInt(rate);
  const negative = product < 0n;
  const abs = negative ? -product : product;
  let q = abs / MICRO;
  if ((abs % MICRO) * 2n >= MICRO) q += 1n;
  return assertCents(Number(negative ? -q : q));
}

/**
 * Proporción part/total como número (0.25 = 25 %). Devuelve null si total es 0.
 * Aquí sí usamos decimales: es un porcentaje para mostrar, no dinero.
 */
export function ratio(part: Cents, total: Cents): number | null {
  return total === 0 ? null : part / total;
}
