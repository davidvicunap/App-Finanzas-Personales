/**
 * PATRIMONIO E INVERSIONES
 * ========================
 * Patrimonio neto = lo que tienes (activos) − lo que debes (deudas).
 *
 * ¿De dónde sale el valor de cada cuenta?
 *  - Cuentas de inversión CON posiciones: suma del valor de mercado de sus posiciones.
 *  - Todas las demás: el saldo más reciente que registraste (BalanceSnapshot).
 *  - Deudas (tarjeta, préstamo, hipoteca): el saldo resta.
 *
 * Todo se suma en la moneda base. Si falta un tipo de cambio, esa cuenta no se
 * suma y se cuenta en `unconverted` (la app nunca inventa un tipo de cambio).
 */
import { convertCents, marketValueCents, sumCents, type Cents, type CurrencyCode } from './money';
import type { LocalDate } from './dates';
import type { FxSettings } from './stats';
import {
  INVESTMENT_TYPES,
  LIABILITY_TYPES,
  type Account,
  type AssetClass,
  type BalanceSnapshot,
  type Holding,
  type Id,
} from './types';

/** Convierte centavos de una moneda a la base. null si falta el tipo de cambio. */
export function centsToBase(cents: Cents, currency: CurrencyCode, fx: FxSettings): Cents | null {
  if (currency === fx.baseCurrency) return cents;
  const rate = fx.fxRates[currency];
  return rate ? convertCents(cents, rate.rateMicros) : null;
}

export function isLiability(account: Pick<Account, 'type'>): boolean {
  return LIABILITY_TYPES.includes(account.type);
}

export function isInvestment(account: Pick<Account, 'type'>): boolean {
  return INVESTMENT_TYPES.includes(account.type);
}

/** Saldo más reciente de una cuenta (en o antes de `onOrBefore`, si se da). */
export function latestBalance(
  balances: readonly BalanceSnapshot[],
  accountId: Id,
  onOrBefore?: LocalDate,
): BalanceSnapshot | undefined {
  let best: BalanceSnapshot | undefined;
  for (const b of balances) {
    if (b.accountId !== accountId || (onOrBefore && b.date > onOrBefore)) continue;
    if (!best || b.date > best.date || (b.date === best.date && b.createdAt > best.createdAt)) best = b;
  }
  return best;
}

/* ---------------------------- Posiciones ---------------------------- */

export interface HoldingRow {
  holding: Holding;
  /** Valor de mercado en la moneda de la posición. */
  valueCents: Cents;
  costCents: Cents;
  /** Ganancia (o pérdida, si es negativa) en la moneda de la posición. */
  gainCents: Cents;
  /** gain / costo. null si el costo es 0. */
  gainRatio: number | null;
  /** Lo mismo en la moneda base (null si falta tipo de cambio). */
  baseValueCents: Cents | null;
  baseGainCents: Cents | null;
}

export function holdingRow(h: Holding, fx: FxSettings): HoldingRow {
  const valueCents = marketValueCents(h.quantity, h.unitPrice, h.multiplier);
  const gainCents = valueCents - h.costBasisCents;
  return {
    holding: h,
    valueCents,
    costCents: h.costBasisCents,
    gainCents,
    gainRatio: h.costBasisCents > 0 ? gainCents / h.costBasisCents : null,
    baseValueCents: centsToBase(valueCents, h.currency, fx),
    baseGainCents: centsToBase(gainCents, h.currency, fx),
  };
}

export interface PortfolioSummary {
  /** Totales por moneda de cotización, sin convertir (ej. lo que tienes en USD, en USD). */
  byCurrency: Partial<Record<CurrencyCode, { valueCents: Cents; costCents: Cents; gainCents: Cents }>>;
  /** Totales combinados en moneda base. */
  baseValueCents: Cents;
  baseCostCents: Cents;
  baseGainCents: Cents;
  unconverted: number;
}

export function portfolioSummary(rows: readonly HoldingRow[], fx: FxSettings): PortfolioSummary {
  const byCurrency: PortfolioSummary['byCurrency'] = {};
  const values: Cents[] = [];
  const costs: Cents[] = [];
  let unconverted = 0;
  for (const r of rows) {
    const c = r.holding.currency;
    const acc = (byCurrency[c] ??= { valueCents: 0, costCents: 0, gainCents: 0 });
    acc.valueCents += r.valueCents;
    acc.costCents += r.costCents;
    acc.gainCents += r.gainCents;
    const v = r.baseValueCents;
    const cost = centsToBase(r.costCents, c, fx);
    if (v === null || cost === null) {
      unconverted++;
      continue;
    }
    values.push(v);
    costs.push(cost);
  }
  const baseValueCents = sumCents(values);
  const baseCostCents = sumCents(costs);
  return { byCurrency, baseValueCents, baseCostCents, baseGainCents: baseValueCents - baseCostCents, unconverted };
}

export interface AllocationSlice {
  key: string;
  cents: Cents;
  share: number;
}

/** Reparto del valor (en moneda base) por tipo de activo o por cuenta. */
export function allocation(rows: readonly HoldingRow[], by: 'assetClass' | 'accountId'): AllocationSlice[] {
  const map = new Map<string, Cents>();
  for (const r of rows) {
    if (r.baseValueCents === null) continue;
    const key: string = by === 'assetClass' ? r.holding.assetClass : r.holding.accountId;
    map.set(key, (map.get(key) ?? 0) + r.baseValueCents);
  }
  const total = sumCents([...map.values()]);
  return [...map.entries()]
    .map(([key, cents]) => ({ key, cents, share: total > 0 ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

/* ---------------------------- Cuentas ---------------------------- */

export interface AccountValue {
  account: Account;
  /** Con signo: las deudas son negativas. En `currency`. */
  cents: Cents;
  currency: CurrencyCode;
  /** En moneda base, con signo. null si falta tipo de cambio. */
  baseCents: Cents | null;
  /** Fecha del dato (saldo o precio más viejo). null si no hay ningún dato. */
  asOf: LocalDate | null;
  source: 'holdings' | 'balance' | 'none';
}

export function accountValue(
  account: Account,
  balances: readonly BalanceSnapshot[],
  holdings: readonly Holding[],
  fx: FxSettings,
): AccountValue {
  const own = holdings.filter((h) => h.accountId === account.id);
  if (isInvestment(account) && own.length > 0) {
    const rows = own.map((h) => holdingRow(h, fx));
    const s = portfolioSummary(rows, fx);
    const oldestPrice = own.reduce((min, h) => (h.priceAsOf < min ? h.priceAsOf : min), own[0]!.priceAsOf);
    return {
      account,
      cents: s.baseValueCents,
      currency: fx.baseCurrency,
      baseCents: s.unconverted > 0 ? null : s.baseValueCents,
      asOf: oldestPrice,
      source: 'holdings',
    };
  }
  const latest = latestBalance(balances, account.id);
  if (!latest) return { account, cents: 0, currency: account.currency, baseCents: 0, asOf: null, source: 'none' };
  const signed = isLiability(account) ? -latest.balanceCents : latest.balanceCents;
  return {
    account,
    cents: signed,
    currency: account.currency,
    baseCents: centsToBase(signed, account.currency, fx),
    asOf: latest.date,
    source: 'balance',
  };
}

export interface NetWorth {
  assetsCents: Cents;
  /** Positivo: total que debes. */
  liabilitiesCents: Cents;
  netCents: Cents;
  /** Solo cuentas de inversión (TFSA, RRSP, FHSA, no registrada, cripto). */
  investableCents: Cents;
  /** Efectivo: cuentas corriente, ahorro y efectivo. */
  cashCents: Cents;
  unconverted: number;
}

export function netWorth(values: readonly AccountValue[]): NetWorth {
  const assets: Cents[] = [];
  const debts: Cents[] = [];
  const invest: Cents[] = [];
  const cash: Cents[] = [];
  let unconverted = 0;
  for (const v of values) {
    if (v.account.archived) continue;
    if (v.baseCents === null) {
      unconverted++;
      continue;
    }
    if (isLiability(v.account)) debts.push(-v.baseCents);
    else assets.push(v.baseCents);
    if (isInvestment(v.account)) invest.push(v.baseCents);
    if (['chequing', 'savings', 'cash'].includes(v.account.type)) cash.push(v.baseCents);
  }
  const assetsCents = sumCents(assets);
  const liabilitiesCents = sumCents(debts);
  return {
    assetsCents,
    liabilitiesCents,
    netCents: assetsCents - liabilitiesCents,
    investableCents: sumCents(invest),
    cashCents: sumCents(cash),
    unconverted,
  };
}

/** Etiqueta de un tipo de activo para gráficos (clave de traducción). */
export const ASSET_CLASS_ORDER: readonly AssetClass[] = ['stock', 'etf', 'option', 'crypto', 'bond', 'cash', 'other'];
