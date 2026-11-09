/**
 * RESPALDO Y EXPORTACIÓN
 * ======================
 * - JSON: copia completa de todo, para restaurar o mudarte de dispositivo.
 * - CSV: los movimientos, para abrirlos en Excel / Google Sheets.
 *
 * Un archivo de respaldo viene "de fuera": nunca se confía en él. Se valida
 * campo por campo con zod; si algo no cuadra, se rechaza con un mensaje claro.
 */
import { z } from 'zod';
import { CURRENCIES, isDecimal, type Cents, type CurrencyCode } from './money';
import { isLocalDate } from './dates';
import { DEFAULT_GROUPS, defaultSettings } from './defaults';
import { ACCOUNT_TYPES, ASSET_CLASSES, REGISTERED_TYPES, type AppData, type Transaction } from './types';

export const BACKUP_FORMAT = 'mis-finanzas-backup';
/** v1: fase 1. v2: añade saldos, presupuestos, metas, inversiones y cuentas registradas. */
export const BACKUP_VERSION = 2;

// Solo letras, números, guiones y guion bajo: un id nunca puede inyectar código.
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id inválido');
const currency = z.enum(CURRENCIES);
const localDate = z.string().refine(isLocalDate, 'fecha inválida (se espera AAAA-MM-DD)');
const text = (max: number) => z.string().max(max);
const isoTime = z.string().max(40);

const memberSchema = z.object({ id, name: text(40), color: text(20), createdAt: isoTime });

const accountSchema = z.object({
  id,
  name: text(60),
  type: z.enum(ACCOUNT_TYPES),
  currency,
  ownerId: id.nullable(),
  institution: text(60),
  archived: z.boolean(),
  createdAt: isoTime,
});

const categorySchema = z.object({
  id,
  kind: z.enum(['income', 'expense']),
  name: text(40),
  builtinKey: text(40).nullable(),
  emoji: text(16),
  archived: z.boolean(),
  order: z.number().int(),
  group: z.enum(['needs', 'wants']).nullable(),
});

const transactionSchema = z.object({
  id,
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency,
  accountId: id,
  categoryId: id.nullable(),
  date: localDate,
  note: text(200),
  memberId: id.nullable(),
  createdAt: isoTime,
  updatedAt: isoTime,
});

const fxRateSchema = z.object({
  rateMicros: z.number().int().positive(),
  asOf: localDate,
  source: z.literal('manual'),
});

const settingsSchema = z.object({
  id: z.literal('settings'),
  locale: z.enum(['es', 'en']),
  theme: z.enum(['system', 'light', 'dark']),
  baseCurrency: currency,
  fxRates: z.object({ CAD: fxRateSchema.optional(), USD: fxRateSchema.optional() }),
  currentMemberId: id.nullable(),
  defaultAccountId: id.nullable(),
  onboarded: z.boolean(),
  budgetMethod: z.enum(['envelopes', '50-30-20']),
  projection: z.object({
    conservativeBps: z.number().int().min(-10_000).max(10_000),
    baseBps: z.number().int().min(-10_000).max(10_000),
    optimisticBps: z.number().int().min(-10_000).max(10_000),
    monthlyContributionCents: z.number().int().nullable(),
    withdrawalRateBps: z.number().int().positive().max(10_000),
    annualExpensesCents: z.number().int().nonnegative().nullable(),
  }),
  dismissedRecurring: z.array(text(300)).max(1000),
});

const cents = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const decimalText = z.string().max(30).refine(isDecimal, 'número decimal inválido');

const balanceSchema = z.object({ id, accountId: id, date: localDate, balanceCents: cents, createdAt: isoTime });
const budgetSchema = z.object({ id, categoryId: id, monthlyCents: cents.nonnegative() });
const goalSchema = z.object({
  id,
  name: text(60),
  emoji: text(16),
  targetCents: cents.nonnegative(),
  savedCents: cents.nonnegative(),
  accountId: id.nullable(),
  targetDate: localDate.nullable(),
  ownerId: id.nullable(),
  archived: z.boolean(),
  createdAt: isoTime,
});
const holdingSchema = z.object({
  id,
  accountId: id,
  symbol: text(40),
  assetClass: z.enum(ASSET_CLASSES),
  currency,
  quantity: decimalText,
  unitPrice: decimalText,
  priceAsOf: localDate,
  multiplier: z.number().int().min(1).max(10_000),
  costBasisCents: cents.nonnegative(),
  createdAt: isoTime,
});
const roomSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}:(tfsa|rrsp|fhsa):\d{4}$/, 'id inválido'),
  memberId: id,
  type: z.enum(REGISTERED_TYPES),
  year: z.number().int().min(2000).max(2200),
  roomCents: cents,
});
const contributionSchema = z.object({
  id,
  memberId: id,
  type: z.enum(REGISTERED_TYPES),
  date: localDate,
  amountCents: cents,
  note: text(200),
  createdAt: isoTime,
});

export const appDataSchema = z
  .object({
    members: z.array(memberSchema),
    accounts: z.array(accountSchema).min(1, 'debe haber al menos una cuenta'),
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
    balances: z.array(balanceSchema),
    budgets: z.array(budgetSchema),
    goals: z.array(goalSchema),
    holdings: z.array(holdingSchema),
    rooms: z.array(roomSchema),
    contributions: z.array(contributionSchema),
    settings: settingsSchema,
  })
  // Integridad: cada movimiento debe apuntar a una cuenta que exista.
  .superRefine((d, ctx) => {
    const accounts = new Set(d.accounts.map((a) => a.id));
    d.transactions.forEach((t, i) => {
      if (!accounts.has(t.accountId)) {
        ctx.addIssue({ code: 'custom', path: ['transactions', i, 'accountId'], message: 'cuenta inexistente' });
      }
    });
    for (const key of ['balances', 'holdings'] as const) {
      d[key].forEach((x, i) => {
        if (!accounts.has(x.accountId)) ctx.addIssue({ code: 'custom', path: [key, i, 'accountId'], message: 'cuenta inexistente' });
      });
    }
  });

/**
 * Convierte un respaldo v1 al formato actual: añade las tablas nuevas vacías
 * y los campos nuevos con sus valores por defecto. No toca los datos existentes.
 */
export function upgradeBackupData(data: unknown, version: number): unknown {
  if (version >= 2 || !data || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  const defaults = defaultSettings('es');
  const categories = Array.isArray(d.categories) ? d.categories : [];
  return {
    ...d,
    categories: categories.map((c: Record<string, unknown>) => ({
      ...c,
      group: c.kind === 'expense' && typeof c.builtinKey === 'string' ? (DEFAULT_GROUPS[c.builtinKey] ?? null) : null,
    })),
    balances: [],
    budgets: [],
    goals: [],
    holdings: [],
    rooms: [],
    contributions: [],
    settings: {
      ...(d.settings as object),
      onboarded: true,
      budgetMethod: defaults.budgetMethod,
      projection: defaults.projection,
      dismissedRecurring: [],
    },
  };
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  exportedAt: z.string(),
  data: z.unknown(),
});

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: AppData;
}

export function createBackup(data: AppData, now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type ParseResult = { ok: true; data: AppData } | { ok: false; error: string };

/** Lee y valida un archivo de respaldo (texto JSON). */
export function parseBackup(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }
  const envelope = backupSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, error: 'El archivo no es un respaldo de Mis Finanzas.' };
  if (envelope.data.version > BACKUP_VERSION) {
    return { ok: false, error: 'El respaldo es de una versión más nueva de la app. Actualízala primero.' };
  }
  const data = appDataSchema.safeParse(upgradeBackupData(envelope.data.data, envelope.data.version));
  if (!data.success) {
    const issue = data.error.issues[0];
    return { ok: false, error: `Respaldo inválido en ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? ''}` };
  }
  return { ok: true, data: data.data as AppData };
}

/* ------------------------------------------------------------------
 * CSV
 * ------------------------------------------------------------------ */

/**
 * Escapa una celda de texto para CSV.
 * Además neutraliza "inyección de fórmulas": si una nota empieza con = + - @,
 * Excel podría ejecutarla como fórmula. Se antepone un apóstrofo.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Centavos → "1234.50" (siempre punto y 2 decimales, sin símbolo: fácil de sumar en Excel). */
export function csvAmount(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface CsvLookups {
  account: (id: string) => string;
  category: (id: string | null) => string;
  member: (id: string | null) => string;
}

/** Movimientos → CSV. Los gastos salen en negativo para que la columna se pueda sumar. */
export function transactionsToCsv(txs: readonly Transaction[], names: CsvLookups): string {
  const header = ['date', 'type', 'amount', 'currency', 'category', 'account', 'member', 'note'];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const signed = t.type === 'expense' ? -t.amountCents : t.amountCents;
      return [
        t.date,
        t.type,
        csvAmount(signed),
        t.currency as CurrencyCode,
        csvCell(names.category(t.categoryId)),
        csvCell(names.account(t.accountId)),
        csvCell(names.member(t.memberId)),
        csvCell(t.note),
      ].join(',');
    });
  // El carácter BOM (U+FEFF) hace que Excel reconozca los acentos (UTF-8).
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------
 * RESPALDO CIFRADO
 * Para guardar el respaldo en la nube o pasárselo a tu pareja sin que nadie
 * más pueda leerlo. Usa el estándar del navegador (Web Crypto):
 *   - PBKDF2-SHA256 (600,000 iteraciones) convierte tu contraseña en una llave,
 *   - AES-GCM de 256 bits cifra el contenido y detecta cualquier alteración.
 * Si olvidas la contraseña, NO hay forma de recuperar el archivo.
 * ------------------------------------------------------------------ */

export const ENCRYPTED_FORMAT = 'mis-finanzas-backup-encrypted';
const PBKDF2_ITERATIONS = 600_000;

// Por bloques: con un respaldo grande, pasar todos los bytes de una vez desborda la pila.
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra un texto (el JSON del respaldo) con una contraseña. Devuelve JSON. */
export async function encryptText(plain: string, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return JSON.stringify({
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv), data: toBase64(cipher) },
  });
}

export function isEncryptedBackup(text: string): boolean {
  try {
    return (JSON.parse(text) as { format?: unknown }).format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

/** Descifra. Lanza un error si la contraseña es incorrecta o el archivo fue alterado. */
export async function decryptText(text: string, passphrase: string): Promise<string> {
  const env = z
    .object({
      format: z.literal(ENCRYPTED_FORMAT),
      kdf: z.object({ iterations: z.number().int().min(100_000).max(10_000_000), salt: z.string().max(100) }),
      cipher: z.object({ iv: z.string().max(100), data: z.string() }),
    })
    .parse(JSON.parse(text));
  const key = await deriveKey(passphrase, fromBase64(env.kdf.salt), env.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(env.cipher.iv) as BufferSource }, key, fromBase64(env.cipher.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Contraseña incorrecta o archivo dañado');
  }
}
