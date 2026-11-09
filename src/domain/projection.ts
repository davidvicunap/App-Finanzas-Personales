/**
 * PROYECCIONES E INDEPENDENCIA FINANCIERA
 * =======================================
 * Interés compuesto mes a mes:  saldo = saldo × (1 + r) + aporte
 *
 * Los rendimientos son SUPUESTOS que eliges tú (conservador / base / optimista);
 * no son una predicción ni una recomendación. Los montos se mantienen en
 * centavos enteros: se redondea al centavo en cada mes.
 *
 * Independencia financiera (FI): el patrimonio invertido con el que podrías
 * cubrir tus gastos anuales retirando un porcentaje fijo (ej. 4 %):
 *      número FI = gasto anual ÷ tasa de retiro   (con 4 % → gasto anual × 25)
 */
import { mulDivCents, type Cents } from './money';

/** Tasa mensual equivalente a una anual dada en puntos básicos (500 = 5 % anual). */
export function monthlyRate(annualBps: number): number {
  return Math.pow(1 + annualBps / 10_000, 1 / 12) - 1;
}

/** Saldo al final de cada mes, durante `months` meses. */
export function project(startCents: Cents, monthlyContributionCents: Cents, annualBps: number, months: number): Cents[] {
  const r = monthlyRate(annualBps);
  const out: Cents[] = [];
  let balance = startCents;
  for (let m = 0; m < months; m++) {
    balance = Math.round(balance * (1 + r)) + monthlyContributionCents;
    out.push(balance);
  }
  return out;
}

export interface Scenario {
  key: 'conservative' | 'base' | 'optimistic';
  annualBps: number;
}

export interface ProjectionRow {
  years: number;
  /** Valor proyectado por escenario. */
  values: Record<Scenario['key'], Cents>;
  /** Total aportado (inicio + aportes), igual para todos los escenarios. */
  contributedCents: Cents;
}

export function projectionTable(
  startCents: Cents,
  monthlyContributionCents: Cents,
  scenarios: readonly Scenario[],
  horizons: readonly number[] = [5, 10, 20, 30],
): ProjectionRow[] {
  const maxMonths = Math.max(...horizons) * 12;
  const series = Object.fromEntries(
    scenarios.map((s) => [s.key, project(startCents, monthlyContributionCents, s.annualBps, maxMonths)]),
  ) as Record<Scenario['key'], Cents[]>;
  return horizons.map((years) => ({
    years,
    values: Object.fromEntries(scenarios.map((s) => [s.key, series[s.key][years * 12 - 1]!])) as Record<Scenario['key'], Cents>,
    contributedCents: startCents + monthlyContributionCents * years * 12,
  }));
}

/** Número FI = gasto anual ÷ tasa de retiro. Con 400 bps (4 %), gasto × 25. */
export function fiNumber(annualExpensesCents: Cents, withdrawalRateBps: number): Cents {
  if (withdrawalRateBps <= 0) throw new Error('La tasa de retiro debe ser mayor que 0');
  return mulDivCents(annualExpensesCents, 10_000, withdrawalRateBps);
}

/**
 * Meses hasta alcanzar `targetCents` con aportes y rendimiento dados.
 * 0 si ya lo alcanzaste; null si no se alcanza en `maxYears` años.
 */
export function monthsToTarget(
  startCents: Cents,
  monthlyContributionCents: Cents,
  annualBps: number,
  targetCents: Cents,
  maxYears = 70,
): number | null {
  if (startCents >= targetCents) return 0;
  const r = monthlyRate(annualBps);
  let balance = startCents;
  for (let m = 1; m <= maxYears * 12; m++) {
    balance = Math.round(balance * (1 + r)) + monthlyContributionCents;
    if (balance >= targetCents) return m;
  }
  return null;
}
