/**
 * OPERACIONES SOBRE LOS DATOS
 * ===========================
 * Toda escritura pasa por aquí: la pantalla nunca toca la base de datos
 * directamente. Así las reglas (validar montos, no borrar categorías usadas…)
 * viven en un solo lugar y se pueden probar.
 */
import { assertCents, isDecimal, type Cents, type CurrencyCode } from '../domain/money';
import { isLocalDate, type LocalDate } from '../domain/dates';
import { MEMBER_COLORS } from '../domain/defaults';
import { appDataSchema } from '../domain/backup';
import { roomId } from '../domain/registered';
import type {
  Account,
  AccountType,
  AppData,
  AssetClass,
  BudgetGroup,
  Category,
  CategoryKind,
  Contribution,
  Goal,
  Holding,
  Id,
  Member,
  RegisteredType,
  Settings,
  Transaction,
  TransactionType,
} from '../domain/types';
import type { WorthSnapshot } from './db';
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

/** Clasifica una categoría de gasto para el método 50/30/20. */
export async function setCategoryGroup(db: FinanzasDB, id: Id, group: BudgetGroup | null): Promise<void> {
  await db.categories.update(id, { group });
}

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
    group: null, // sin clasificar (cuenta como "deseo" en 50/30/20 hasta que la clasifiques)
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

const ALL_TABLES = (db: FinanzasDB) => [
  db.members, db.accounts, db.categories, db.transactions, db.settings,
  db.balances, db.budgets, db.goals, db.holdings, db.rooms, db.contributions, db.worth,
];

export async function exportAll(db: FinanzasDB): Promise<AppData> {
  const [members, accounts, categories, transactions, settings, balances, budgets, goals, holdings, rooms, contributions] = await Promise.all([
    db.members.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.settings.get('settings'),
    db.balances.toArray(),
    db.budgets.toArray(),
    db.goals.toArray(),
    db.holdings.toArray(),
    db.rooms.toArray(),
    db.contributions.toArray(),
  ]);
  if (!settings) throw new Error('Faltan los ajustes');
  return { members, accounts, categories, transactions, balances, budgets, goals, holdings, rooms, contributions, settings };
}

/** Reemplaza TODO por los datos dados (ya validados). Es atómico: o todo o nada. */
export async function replaceAll(db: FinanzasDB, data: AppData): Promise<void> {
  const v = appDataSchema.parse(data) as AppData; // segunda validación, por seguridad
  await db.transaction('rw', ALL_TABLES(db), async () => {
    await Promise.all(ALL_TABLES(db).map((t) => t.clear()));
    await db.members.bulkAdd(v.members);
    await db.accounts.bulkAdd(v.accounts);
    await db.categories.bulkAdd(v.categories);
    await db.transactions.bulkAdd(v.transactions);
    await db.balances.bulkAdd(v.balances);
    await db.budgets.bulkAdd(v.budgets);
    await db.goals.bulkAdd(v.goals);
    await db.holdings.bulkAdd(v.holdings);
    await db.rooms.bulkAdd(v.rooms);
    await db.contributions.bulkAdd(v.contributions);
    await db.settings.add(v.settings);
  });
}

/** Borra solo los movimientos; conserva cuentas, categorías y ajustes. */
export async function wipeTransactions(db: FinanzasDB): Promise<void> {
  await db.transactions.clear();
}

/* ------------------------------ Saldos ------------------------------ */

/** Registra el saldo de una cuenta en una fecha. Si ya había uno ese día, lo reemplaza. */
export async function setBalance(db: FinanzasDB, accountId: Id, date: LocalDate, balanceCents: Cents): Promise<void> {
  assertCents(balanceCents);
  if (!isLocalDate(date)) throw new Error(`Fecha inválida: ${date}`);
  if (!(await db.accounts.get(accountId))) throw new Error('La cuenta no existe');
  await db.transaction('rw', db.balances, async () => {
    const sameDay = await db.balances.where('accountId').equals(accountId).filter((b) => b.date === date).toArray();
    await db.balances.bulkDelete(sameDay.map((b) => b.id));
    await db.balances.add({ id: newId(), accountId, date, balanceCents, createdAt: nowIso() });
  });
}

export async function deleteBalance(db: FinanzasDB, id: Id): Promise<void> {
  await db.balances.delete(id);
}

/** Guarda (o actualiza) la foto del patrimonio de este mes. */
export async function saveWorthSnapshot(db: FinanzasDB, snap: WorthSnapshot): Promise<void> {
  const prev = await db.worth.get(snap.id);
  if (prev && prev.netCents === snap.netCents && prev.assetsCents === snap.assetsCents && prev.investableCents === snap.investableCents) return;
  await db.worth.put(snap);
}

/* ---------------------------- Presupuesto ---------------------------- */

/** Fija el límite mensual de una categoría. 0 = quitar el presupuesto. */
export async function setBudget(db: FinanzasDB, categoryId: Id, monthlyCents: Cents): Promise<void> {
  assertCents(monthlyCents);
  if (monthlyCents < 0) throw new Error('El presupuesto no puede ser negativo');
  if (monthlyCents === 0) await db.budgets.delete(categoryId);
  else await db.budgets.put({ id: categoryId, categoryId, monthlyCents });
}

/* ------------------------------- Metas ------------------------------- */

export type GoalInput = Pick<Goal, 'name' | 'emoji' | 'targetCents' | 'savedCents' | 'accountId' | 'targetDate' | 'ownerId'>;

function validateGoal(input: GoalInput): GoalInput {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error('El nombre no puede estar vacío');
  assertCents(input.targetCents);
  assertCents(input.savedCents);
  if (input.targetCents <= 0) throw new Error('La meta debe ser mayor que cero');
  if (input.savedCents < 0) throw new Error('Lo ahorrado no puede ser negativo');
  if (input.targetDate && !isLocalDate(input.targetDate)) throw new Error('Fecha inválida');
  return { ...input, name, emoji: input.emoji || '🎯' };
}

export async function addGoal(db: FinanzasDB, input: GoalInput): Promise<Goal> {
  const goal: Goal = { ...validateGoal(input), id: newId(), archived: false, createdAt: nowIso() };
  await db.goals.add(goal);
  return goal;
}

export async function updateGoal(db: FinanzasDB, id: Id, input: GoalInput): Promise<void> {
  await db.goals.update(id, validateGoal(input));
}

/** Suma (o resta, si es negativo) un aporte a lo ahorrado de una meta. */
export async function addToGoal(db: FinanzasDB, id: Id, deltaCents: Cents): Promise<void> {
  assertCents(deltaCents);
  await db.transaction('rw', db.goals, async () => {
    const g = await db.goals.get(id);
    if (!g) throw new Error('La meta no existe');
    await db.goals.update(id, { savedCents: Math.max(0, g.savedCents + deltaCents) });
  });
}

export async function deleteGoal(db: FinanzasDB, id: Id): Promise<Goal | undefined> {
  const g = await db.goals.get(id);
  await db.goals.delete(id);
  return g;
}

/* ---------------------------- Inversiones ---------------------------- */

export interface HoldingInput {
  accountId: Id;
  symbol: string;
  assetClass: AssetClass;
  currency: CurrencyCode;
  quantity: string;
  unitPrice: string;
  priceAsOf: LocalDate;
  multiplier: number;
  costBasisCents: Cents;
}

function validateHolding(input: HoldingInput): HoldingInput {
  const symbol = input.symbol.trim().toUpperCase().slice(0, 40);
  if (!symbol) throw new Error('Escribe el símbolo (ej. VFV, AAPL, BTC)');
  const quantity = input.quantity.trim().replace(',', '.');
  const unitPrice = input.unitPrice.trim().replace(',', '.');
  if (!isDecimal(quantity)) throw new Error('Cantidad inválida');
  if (!isDecimal(unitPrice)) throw new Error('Precio inválido');
  if (!isLocalDate(input.priceAsOf)) throw new Error('Fecha inválida');
  if (!Number.isInteger(input.multiplier) || input.multiplier < 1) throw new Error('Multiplicador inválido');
  assertCents(input.costBasisCents);
  if (input.costBasisCents < 0) throw new Error('El costo no puede ser negativo');
  return { ...input, symbol, quantity, unitPrice };
}

export async function addHolding(db: FinanzasDB, input: HoldingInput): Promise<Holding> {
  if (!(await db.accounts.get(input.accountId))) throw new Error('La cuenta no existe');
  const h: Holding = { ...validateHolding(input), id: newId(), createdAt: nowIso() };
  await db.holdings.add(h);
  return h;
}

export async function updateHolding(db: FinanzasDB, id: Id, input: HoldingInput): Promise<void> {
  await db.holdings.update(id, validateHolding(input));
}

/** Actualiza solo el precio (lo más frecuente). */
export async function updateHoldingPrice(db: FinanzasDB, id: Id, unitPrice: string, asOf: LocalDate): Promise<void> {
  const price = unitPrice.trim().replace(',', '.');
  if (!isDecimal(price)) throw new Error('Precio inválido');
  await db.holdings.update(id, { unitPrice: price, priceAsOf: asOf });
}

export async function deleteHolding(db: FinanzasDB, id: Id): Promise<Holding | undefined> {
  const h = await db.holdings.get(id);
  await db.holdings.delete(id);
  return h;
}

/* ------------------------ Cuentas registradas ------------------------ */

export async function setRoom(db: FinanzasDB, memberId: Id, type: RegisteredType, year: number, roomCents: Cents): Promise<void> {
  assertCents(roomCents);
  await db.rooms.put({ id: roomId(memberId, type, year), memberId, type, year, roomCents });
}

export async function addContribution(
  db: FinanzasDB,
  input: Pick<Contribution, 'memberId' | 'type' | 'date' | 'amountCents' | 'note'>,
): Promise<Contribution> {
  assertCents(input.amountCents);
  if (input.amountCents === 0) throw new Error('El monto no puede ser cero');
  if (!isLocalDate(input.date)) throw new Error('Fecha inválida');
  const c: Contribution = { ...input, note: input.note.trim().slice(0, 200), id: newId(), createdAt: nowIso() };
  await db.contributions.add(c);
  return c;
}

export async function deleteContribution(db: FinanzasDB, id: Id): Promise<void> {
  await db.contributions.delete(id);
}

/* ---------------------------- Recurrentes ---------------------------- */

/** Marca un recurrente detectado como "no es recurrente" (o lo vuelve a mostrar). */
export async function setRecurringDismissed(db: FinanzasDB, key: string, dismissed: boolean): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get('settings');
    if (!s) return;
    const set = new Set(s.dismissedRecurring);
    if (dismissed) set.add(key);
    else set.delete(key);
    await db.settings.update('settings', { dismissedRecurring: [...set] });
  });
}
