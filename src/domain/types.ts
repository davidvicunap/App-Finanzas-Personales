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

/** Tipos de cuenta. Las registradas (TFSA, RRSP, FHSA) se usarán en la fase de inversión. */
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
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

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
}

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
}

/** Todo el contenido de la app, tal como se exporta/importa. */
export interface AppData {
  members: Member[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings: Settings;
}
