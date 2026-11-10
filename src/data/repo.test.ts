import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanzasDB } from './db';
import * as repo from './repo';
import { createBackup, parseBackup } from '../domain/backup';

let db: FinanzasDB;
let n = 0;

beforeEach(async () => {
  db = new FinanzasDB(`test-${++n}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const base = (p: Partial<repo.TransactionInput> = {}): repo.TransactionInput => ({
  type: 'expense',
  amountCents: 1250,
  accountId: 'account-main',
  categoryId: 'cat-groceries',
  date: '2026-11-09',
  note: '  Save-On-Foods  ',
  memberId: 'member-1',
  ...p,
});

describe('base de datos nueva', () => {
  it('se crea con una persona, una cuenta CAD, categorías y ajustes', async () => {
    expect(await db.members.count()).toBe(1);
    expect((await db.accounts.get('account-main'))?.currency).toBe('CAD');
    expect(await db.categories.where('kind').equals('expense').count()).toBeGreaterThan(10);
    expect((await db.settings.get('settings'))?.baseCurrency).toBe('CAD');
  });
});

describe('movimientos', () => {
  it('añadir: limpia la nota y toma la moneda de la cuenta', async () => {
    const usd = await repo.addAccount(db, { name: 'Wealthsimple USD', type: 'chequing', currency: 'USD', ownerId: null, institution: 'Wealthsimple' });
    const tx = await repo.addTransaction(db, base({ accountId: usd.id }));
    expect(tx.note).toBe('Save-On-Foods');
    expect(tx.currency).toBe('USD');
    expect(await db.transactions.count()).toBe(1);
  });

  it('rechaza montos no enteros, cero, fechas inválidas y cuentas inexistentes', async () => {
    await expect(repo.addTransaction(db, base({ amountCents: 12.5 }))).rejects.toThrow();
    await expect(repo.addTransaction(db, base({ amountCents: 0 }))).rejects.toThrow();
    await expect(repo.addTransaction(db, base({ date: '2026-02-30' }))).rejects.toThrow();
    await expect(repo.addTransaction(db, base({ accountId: 'nope' }))).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });

  it('borrar y deshacer', async () => {
    const tx = await repo.addTransaction(db, base());
    const deleted = await repo.deleteTransaction(db, tx.id);
    expect(await db.transactions.count()).toBe(0);
    await repo.restoreTransaction(db, deleted!);
    expect(await db.transactions.get(tx.id)).toEqual(tx);
  });

  it('editar', async () => {
    const tx = await repo.addTransaction(db, base());
    await repo.updateTransaction(db, tx.id, base({ amountCents: 999, note: 'x' }));
    expect((await db.transactions.get(tx.id))?.amountCents).toBe(999);
  });
});

describe('categorías', () => {
  it('archivar conserva la categoría en movimientos viejos', async () => {
    const tx = await repo.addTransaction(db, base({ categoryId: 'cat-dining' }));
    await repo.setCategoryArchived(db, 'cat-dining', true);
    expect((await db.transactions.get(tx.id))?.categoryId).toBe('cat-dining');
    expect((await db.categories.get('cat-dining'))?.archived).toBe(true);
  });

  it('no permite duplicados ni quedarse sin categorías', async () => {
    await repo.addCategory(db, 'income', 'Airbnb', '🏡');
    await expect(repo.addCategory(db, 'income', 'airbnb', '')).rejects.toThrow('ya existe');
    const income = await db.categories.where('kind').equals('income').toArray();
    for (const c of income.slice(0, -1)) await repo.setCategoryArchived(db, c.id, true);
    await expect(repo.setCategoryArchived(db, income.at(-1)!.id, true)).rejects.toThrow();
  });
});

describe('cuentas', () => {
  it('no permite cambiar la moneda de una cuenta con movimientos', async () => {
    await repo.addTransaction(db, base());
    await expect(
      repo.updateAccount(db, 'account-main', { name: 'X', type: 'chequing', currency: 'USD', ownerId: null, institution: '' }),
    ).rejects.toThrow();
  });
});

describe('respaldo completo', () => {
  it('exportar → JSON → validar → restaurar da los mismos datos', async () => {
    await repo.addMember(db, 'Ana');
    await repo.addTransaction(db, base());
    await repo.addTransaction(db, base({ type: 'income', amountCents: 500000, categoryId: 'cat-salary' }));
    const before = await repo.exportAll(db);

    const json = JSON.stringify(createBackup(before));
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);

    const other = new FinanzasDB(`test-restore-${n}`);
    await other.open();
    await repo.replaceAll(other, (parsed as { ok: true; data: typeof before }).data);
    const after = await repo.exportAll(other);
    const sortById = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(sortById(after.transactions)).toEqual(sortById(before.transactions));
    expect(sortById(after.members)).toEqual(sortById(before.members));
    expect(after.settings).toEqual(before.settings);
    await other.delete();
  });
});

describe('fase 2+: saldos, presupuestos, metas, inversiones, registradas', () => {
  it('setBalance reemplaza el saldo del mismo día', async () => {
    await repo.setBalance(db, 'account-main', '2026-11-01', 100);
    await repo.setBalance(db, 'account-main', '2026-11-01', 200);
    await repo.setBalance(db, 'account-main', '2026-11-02', 300);
    const all = await db.balances.toArray();
    expect(all.map((b) => b.balanceCents).sort()).toEqual([200, 300]);
    await expect(repo.setBalance(db, 'nope', '2026-11-01', 1)).rejects.toThrow();
  });

  it('setBudget con 0 quita el presupuesto', async () => {
    await repo.setBudget(db, 'cat-dining', 30_000);
    expect((await db.budgets.get('cat-dining'))?.monthlyCents).toBe(30_000);
    await repo.setBudget(db, 'cat-dining', 0);
    expect(await db.budgets.count()).toBe(0);
    await expect(repo.setBudget(db, 'cat-dining', -1)).rejects.toThrow();
  });

  it('metas: crear, aportar (nunca bajo cero) y validar', async () => {
    const g = await repo.addGoal(db, { name: ' Casa ', emoji: '', targetCents: 5_000_000, savedCents: 0, accountId: null, targetDate: '2028-06-01', ownerId: null });
    expect(g).toMatchObject({ name: 'Casa', emoji: '🎯' });
    await repo.addToGoal(db, g.id, 10_000);
    await repo.addToGoal(db, g.id, -50_000);
    expect((await db.goals.get(g.id))?.savedCents).toBe(0);
    await expect(repo.addGoal(db, { ...g, targetCents: 0 })).rejects.toThrow();
  });

  it('posiciones: normaliza símbolo y decimales, rechaza inválidos', async () => {
    const tfsa = await repo.addAccount(db, { name: 'TFSA', type: 'tfsa', currency: 'CAD', ownerId: null, institution: 'Wealthsimple' });
    const h = await repo.addHolding(db, { accountId: tfsa.id, symbol: ' vfv ', assetClass: 'etf', currency: 'CAD', quantity: '10,5', unitPrice: '150', priceAsOf: '2026-11-08', multiplier: 1, costBasisCents: 100_000 });
    expect(h).toMatchObject({ symbol: 'VFV', quantity: '10.5' });
    await repo.updateHoldingPrice(db, h.id, '155.10', '2026-11-09');
    expect(await db.holdings.get(h.id)).toMatchObject({ unitPrice: '155.10', priceAsOf: '2026-11-09' });
    await expect(repo.addHolding(db, { ...h, quantity: 'diez' })).rejects.toThrow('Cantidad');
    await expect(repo.updateHoldingPrice(db, h.id, '-1', '2026-11-09')).rejects.toThrow();
  });

  it('espacio registrado y aportes', async () => {
    await repo.setRoom(db, 'member-1', 'tfsa', 2026, 700_000);
    await repo.setRoom(db, 'member-1', 'tfsa', 2026, 750_000); // reemplaza
    await repo.addContribution(db, { memberId: 'member-1', type: 'tfsa', date: '2026-02-01', amountCents: 100_000, note: '' });
    expect(await db.rooms.count()).toBe(1);
    expect((await db.rooms.get('member-1:tfsa:2026'))?.roomCents).toBe(750_000);
    await expect(repo.addContribution(db, { memberId: 'member-1', type: 'tfsa', date: '2026-02-01', amountCents: 0, note: '' })).rejects.toThrow();
  });

  it('recurrentes descartados', async () => {
    await repo.setRecurringDismissed(db, 'k1', true);
    await repo.setRecurringDismissed(db, 'k1', true);
    expect((await db.settings.get('settings'))?.dismissedRecurring).toEqual(['k1']);
    await repo.setRecurringDismissed(db, 'k1', false);
    expect((await db.settings.get('settings'))?.dismissedRecurring).toEqual([]);
  });

  it('el respaldo completo incluye las tablas nuevas', async () => {
    await repo.setBudget(db, 'cat-dining', 30_000);
    await repo.addGoal(db, { name: 'Viaje', emoji: '✈️', targetCents: 300_000, savedCents: 0, accountId: null, targetDate: null, ownerId: null });
    const data = await repo.exportAll(db);
    const other = new FinanzasDB(`test-restore2-${n}`);
    await other.open();
    await repo.replaceAll(other, data);
    expect(await other.budgets.count()).toBe(1);
    expect(await other.goals.count()).toBe(1);
    await other.delete();
  });
});
