/**
 * OPERACIONES SOBRE LOS DATOS
 * ===========================
 * Toda escritura pasa por aquí: la pantalla nunca toca la base de datos
 * directamente. Así las reglas (validar montos, no borrar categorías usadas…)
 * viven en un solo lugar y se pueden probar.
 */
import { assertCents, type Cents, type CurrencyCode } from '../domain/money';
import { isLocalDate, type LocalDate } from '../domain/dates';
import { MEMBER_COLORS } from '../domain/defaults';
import { appDataSchema } from '../domain/backup';
import type {
  Account,
  AccountType,
  AppData,
  Category,
  CategoryKind,
  Id,
  Member,
  Settings,
  Transaction,
  TransactionType,
} from '../domain/types';
import type { FinanzasDB } from './db';

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/* ---------------------------- Movimientos ---------------------------- */

export interface TransactionInput {
  type: TransactionType;
  amountCents: Cents;
  accountId: Id;
  categoryId: Id | null;
  date: LocalDate;
  note: string;
  memberId: Id | null;
}

async function validateTx(db: FinanzasDB, input: TransactionInput): Promise<Account> {
  assertCents(input.amountCents);
  if (input.amountCents <= 0) throw new Error('El monto debe ser mayor que cero');
  if (!isLocalDate(input.date)) throw new Error(`Fecha inválida: ${input.date}`);
  const account = await db.accounts.get(input.accountId);
  if (!account) throw new Error('La cuenta no existe');
  return account;
}

export async function addTransaction(db: FinanzasDB, input: TransactionInput): Promise<Transaction> {
  const account = await validateTx(db, input);
  const now = nowIso();
  const tx: Transaction = {
    ...input,
    note: input.note.trim().slice(0, 200),
    id: newId(),
    currency: account.currency, // la moneda la define la cuenta
    createdAt: now,
    updatedAt: now,
  };
  await db.transactions.add(tx);
  return tx;
}

export async function updateTransaction(db: FinanzasDB, id: Id, input: TransactionInput): Promise<void> {
  const account = await validateTx(db, input);
  const updated = await db.transactions.update(id, {
    ...input,
    note: input.note.trim().slice(0, 200),
    currency: account.currency,
    updatedAt: nowIso(),
  });
  if (!updated) throw new Error('El movimiento no existe');
}

/** Borra y devuelve el movimiento, para poder deshacer. */
export async function deleteTransaction(db: FinanzasDB, id: Id): Promise<Transaction | undefined> {
  return db.transaction('rw', db.transactions, async () => {
    const tx = await db.transactions.get(id);
    if (tx) await db.transactions.delete(id);
    return tx;
  });
}

/** Deshacer un borrado. */
export async function restoreTransaction(db: FinanzasDB, tx: Transaction): Promise<void> {
  await db.transactions.put(tx);
}

/* ---------------------------- Categorías ---------------------------- */

export async function addCategory(db: FinanzasDB, kind: CategoryKind, name: string, emoji: string): Promise<Category> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('El nombre no puede estar vacío');
  const all = await db.categories.where('kind').equals(kind).toArray();
  if (all.some((c) => !c.archived && c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Esa categoría ya existe');
  }
  const cat: Category = {
    id: newId(),
    kind,
    name: clean,
    builtinKey: null,
    emoji: emoji || (kind === 'income' ? '💰' : '🧾'),
    archived: false,
    order: all.length,
  };
  await db.categories.add(cat);
  return cat;
}

export async function updateCategory(db: FinanzasDB, id: Id, changes: Partial<Pick<Category, 'name' | 'emoji'>>) {
  await db.categories.update(id, {
    ...(changes.name !== undefined && { name: changes.name.trim().slice(0, 40) }),
    ...(changes.emoji !== undefined && { emoji: changes.emoji }),
  });
}

/**
 * Las categorías no se borran: se ARCHIVAN. Desaparecen al registrar, pero los
 * movimientos viejos conservan su categoría (corrige un bug de la versión anterior).
 */
export async function setCategoryArchived(db: FinanzasDB, id: Id, archived: boolean): Promise<void> {
  if (archived) {
    const cat = await db.categories.get(id);
    if (!cat) return;
    const active = await db.categories.where('kind').equals(cat.kind).filter((c) => !c.archived).count();
    if (active <= 1) throw new Error('Deja al menos una categoría activa');
  }
  await db.categories.update(id, { archived });
}

/* ------------------------- Personas y cuentas ------------------------- */

export async function addMember(db: FinanzasDB, name: string): Promise<Member> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('El nombre no puede estar vacío');
  const count = await db.members.count();
  const member: Member = {
    id: newId(),
    name: clean,
    color: MEMBER_COLORS[count % MEMBER_COLORS.length]!,
    createdAt: nowIso(),
  };
  await db.members.add(member);
  return member;
}

export async function renameMember(db: FinanzasDB, id: Id, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('El nombre no puede estar vacío');
  await db.members.update(id, { name: clean });
}

export interface AccountInput {
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  ownerId: Id | null;
  institution: string;
}

export async function addAccount(db: FinanzasDB, input: AccountInput): Promise<Account> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error('El nombre no puede estar vacío');
  const account: Account = {
    ...input,
    name,
    institution: input.institution.trim().slice(0, 60),
    id: newId(),
    archived: false,
    createdAt: nowIso(),
  };
  await db.accounts.add(account);
  return account;
}

/** La moneda no se puede cambiar si la cuenta ya tiene movimientos (alteraría montos). */
export async function updateAccount(db: FinanzasDB, id: Id, input: AccountInput): Promise<void> {
  const current = await db.accounts.get(id);
  if (!current) throw new Error('La cuenta no existe');
  if (current.currency !== input.currency) {
    const used = await db.transactions.where('accountId').equals(id).count();
    if (used > 0) throw new Error('No se puede cambiar la moneda de una cuenta con movimientos');
  }
  await db.accounts.update(id, {
    ...input,
    name: input.name.trim().slice(0, 60) || current.name,
    institution: input.institution.trim().slice(0, 60),
  });
}

export async function setAccountArchived(db: FinanzasDB, id: Id, archived: boolean): Promise<void> {
  if (archived) {
    const active = await db.accounts.filter((a) => !a.archived).count();
    if (active <= 1) throw new Error('Deja al menos una cuenta activa');
  }
  await db.accounts.update(id, { archived });
}

/* ------------------------------ Ajustes ------------------------------ */

export async function updateSettings(db: FinanzasDB, changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('settings', changes);
}

/* --------------------------- Respaldo total --------------------------- */

export async function exportAll(db: FinanzasDB): Promise<AppData> {
  const [members, accounts, categories, transactions, settings] = await Promise.all([
    db.members.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.settings.get('settings'),
  ]);
  if (!settings) throw new Error('Faltan los ajustes');
  return { members, accounts, categories, transactions, settings };
}

/** Reemplaza TODO por los datos dados (ya validados). Es atómico: o todo o nada. */
export async function replaceAll(db: FinanzasDB, data: AppData): Promise<void> {
  const valid = appDataSchema.parse(data) as AppData; // segunda validación, por seguridad
  await db.transaction('rw', [db.members, db.accounts, db.categories, db.transactions, db.settings], async () => {
    await Promise.all([db.members.clear(), db.accounts.clear(), db.categories.clear(), db.transactions.clear(), db.settings.clear()]);
    await db.members.bulkAdd(valid.members);
    await db.accounts.bulkAdd(valid.accounts);
    await db.categories.bulkAdd(valid.categories);
    await db.transactions.bulkAdd(valid.transactions);
    await db.settings.add(valid.settings);
  });
}

/** Borra solo los movimientos; conserva cuentas, categorías y ajustes. */
export async function wipeTransactions(db: FinanzasDB): Promise<void> {
  await db.transactions.clear();
}
