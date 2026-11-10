/**
 * MODELO DE DATOS
 * ===============
 * Diseñado desde el inicio para un HOGAR (tú y tu pareja), con varias cuentas
 * en CAD y USD. Las fases siguientes (presupuestos, metas, inversiones,
 * sincronización) se apoyan en estas mismas piezas.
 *
 *   Hogar
 *    ├─ Personas (Member)        ← quién gasta / de quién es una cuenta
 *    ├─ Cuentas (Account)        ← CIBC, Wealthsimple, TFSA, tarjeta…
 *    ├─ Categorías (Category)
 *    └─ Movimientos (Transaction) → siempre pertenecen a una cuenta
 */
import type { Cents, CurrencyCode, RateMicros } from './money';
import type { LocalDate } from './dates';

/** Identificador único (UUID). */
export type Id = string;

export interface Member {
  id: Id;
  name: string;
  /** Color para distinguir a cada persona en gráficos. */
  color: string;
  createdAt: string;
}

/** Tipos de cuenta. */
export const ACCOUNT_TYPES = [
  'chequing',
  'savings',
  'credit_card',
  'cash',
  'tfsa',
  'rrsp',
  'fhsa',
  'non_registered',
  'crypto',
  'property',
  'loan',
  'mortgage',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Deudas: su saldo RESTA del patrimonio. El saldo se escribe en positivo (lo que debes). */
export const LIABILITY_TYPES: readonly AccountType[] = ['credit_card', 'loan', 'mortgage'];
/** Cuentas de inversión: su valor sale de las posiciones (Holding), si las hay. */
export const INVESTMENT_TYPES: readonly AccountType[] = ['tfsa', 'rrsp', 'fhsa', 'non_registered', 'crypto'];
/** Cuentas registradas con espacio de contribución (CRA). */
export const REGISTERED_TYPES = ['tfsa', 'rrsp', 'fhsa'] as const;
export type RegisteredType = (typeof REGISTERED_TYPES)[number];

export interface Account {
  id: Id;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  /** Persona dueña. `null` = cuenta compartida del hogar. */
  ownerId: Id | null;
  /** Ej.: "CIBC", "Wealthsimple". Libre. */
  institution: string;
  archived: boolean;
  createdAt: string;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: Id;
  kind: CategoryKind;
  /**
   * Nombre escrito por la persona. Si está vacío, se muestra la traducción de
   * `builtinKey` (así las categorías por defecto cambian con el idioma).
   */
  name: string;
  builtinKey: string | null;
  emoji: string;
  /** Las categorías no se borran: se archivan, y los movimientos viejos las conservan. */
  archived: boolean;
  order: number;
  /** Para el método 50/30/20: necesidad, deseo o sin clasificar. Solo gastos. */
  group: BudgetGroup | null;
}

export type BudgetGroup = 'needs' | 'wants';

/**
 * - income / expense: entra o sale dinero del hogar.
 * - transfer: mueve dinero entre tus propias cuentas (ej. pagar la tarjeta).
 *   No cuenta como gasto ni ingreso. Se usará al importar CSV.
 */
export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: Id;
  type: TransactionType;
  /** Siempre POSITIVO. El `type` indica si entra o sale. */
  amountCents: Cents;
  /** Moneda del movimiento (la de su cuenta). */
  currency: CurrencyCode;
  accountId: Id;
  categoryId: Id | null;
  date: LocalDate;
  note: string;
  /** Quién lo hizo. `null` = gasto compartido. */
  memberId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export type Locale = 'es' | 'en';
export type ThemePref = 'system' | 'light' | 'dark';

/** Tipo de cambio introducido por la persona (la fase 2 lo traerá del Banco de Canadá). */
export interface FxRate {
  /** Cuántas unidades de la moneda base vale 1 unidad de la otra moneda, x 1,000,000. */
  rateMicros: RateMicros;
  asOf: LocalDate;
  source: 'manual';
}

/** Saldo de una cuenta en una fecha (lo copias de tu banco). El patrimonio usa el más reciente. */
export interface BalanceSnapshot {
  id: Id;
  accountId: Id;
  date: LocalDate;
  /** En la moneda de la cuenta. Para deudas, lo que debes (positivo). */
  balanceCents: Cents;
  createdAt: string;
}

/** Límite mensual de gasto para una categoría (método de sobres). */
export interface Budget {
  /** Igual al id de la categoría: un presupuesto por categoría. */
  id: Id;
  categoryId: Id;
  monthlyCents: Cents;
}

/** Meta de ahorro: fondo de emergencia, casa, viaje… */
export interface Goal {
  id: Id;
  name: string;
  emoji: string;
  /** En la moneda base. */
  targetCents: Cents;
  /** Ahorrado hasta hoy (si no está vinculada a una cuenta). */
  savedCents: Cents;
  /** Si está vinculada, lo ahorrado = saldo actual de esa cuenta. */
  accountId: Id | null;
  targetDate: LocalDate | null;
  ownerId: Id | null;
  archived: boolean;
  createdAt: string;
}

export const ASSET_CLASSES = ['stock', 'etf', 'option', 'crypto', 'bond', 'cash', 'other'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Una posición de inversión: cuántas unidades tienes de algo, cuánto pagaste y cuánto vale. */
export interface Holding {
  id: Id;
  accountId: Id;
  /** Ej.: "VFV", "AAPL", "BTC", "AAPL 250117C200". */
  symbol: string;
  assetClass: AssetClass;
  /** Moneda en que cotiza (puede diferir de la cuenta: acciones de EE. UU. en USD). */
  currency: CurrencyCode;
  /** Cantidad como texto decimal exacto ("10", "0.00512"). Nunca float. */
  quantity: string;
  /** Precio por unidad como texto decimal exacto. Lo actualizas tú. */
  unitPrice: string;
  priceAsOf: LocalDate;
  /** Contratos de opciones: normalmente 100 acciones por contrato. 1 para todo lo demás. */
  multiplier: number;
  /** Costo total pagado (incluye comisiones), en la moneda de la posición. */
  costBasisCents: Cents;
  createdAt: string;
}

/** Espacio de contribución disponible al 1 de enero de un año, según CRA (My Account). */
export interface RegisteredRoom {
  /** `${memberId}:${type}:${year}` */
  id: string;
  memberId: Id;
  type: RegisteredType;
  year: number;
  roomCents: Cents;
}

/** Aporte o retiro de una cuenta registrada. */
export interface Contribution {
  id: Id;
  memberId: Id;
  type: RegisteredType;
  date: LocalDate;
  /** Positivo = aporte, negativo = retiro. En CAD. */
  amountCents: Cents;
  note: string;
  createdAt: string;
}

export type BudgetMethod = 'envelopes' | '50-30-20';

export interface Settings {
  id: 'settings';
  locale: Locale;
  theme: ThemePref;
  /** Moneda en la que se suman los totales del dashboard. */
  baseCurrency: CurrencyCode;
  /** Tipos de cambio hacia la moneda base, por moneda. */
  fxRates: Partial<Record<CurrencyCode, FxRate>>;
  /** Persona que usa este dispositivo (para preseleccionarla al registrar). */
  currentMemberId: Id | null;
  /** Cuenta preseleccionada al registrar un movimiento. */
  defaultAccountId: Id | null;
  /** ¿Ya se completó la bienvenida guiada? */
  onboarded: boolean;
  budgetMethod: BudgetMethod;
  /** Supuestos para proyecciones. Rendimientos anuales en puntos básicos (500 = 5 %). */
  projection: {
    conservativeBps: number;
    baseBps: number;
    optimisticBps: number;
    /** Aporte mensual a inversiones que quieres proyectar. null = usar tu ahorro promedio. */
    monthlyContributionCents: Cents | null;
    /** Tasa de retiro para independencia financiera (400 = 4 %). */
    withdrawalRateBps: number;
    /** Gasto anual esperado en la independencia. null = usar tus últimos 12 meses. */
    annualExpensesCents: Cents | null;
  };
  /** Recurrentes detectados que marcaste como "no es recurrente". */
  dismissedRecurring: string[];
}

/** Todo el contenido de la app, tal como se exporta/importa. */
export interface AppData {
  members: Member[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  balances: BalanceSnapshot[];
  budgets: Budget[];
  goals: Goal[];
  holdings: Holding[];
  rooms: RegisteredRoom[];
  contributions: Contribution[];
  settings: Settings;
}
