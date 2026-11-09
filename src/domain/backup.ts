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
import { CURRENCIES, type Cents, type CurrencyCode } from './money';
import { isLocalDate } from './dates';
import { ACCOUNT_TYPES, type AppData, type Transaction } from './types';

export const BACKUP_FORMAT = 'mis-finanzas-backup';
export const BACKUP_VERSION = 1;

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
});

export const appDataSchema = z
  .object({
    members: z.array(memberSchema),
    accounts: z.array(accountSchema).min(1, 'debe haber al menos una cuenta'),
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
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
  });

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
  const data = appDataSchema.safeParse(envelope.data.data);
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
  // ﻿ (BOM) hace que Excel reconozca los acentos (UTF-8).
  return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}
