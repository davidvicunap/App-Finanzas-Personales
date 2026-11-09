/**
 * Simula a alguien que usó la fase 1 (base de datos v1) y abre la nueva versión:
 * sus datos deben conservarse y los campos nuevos deben aparecer.
 */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FinanzasDB } from './db';
import { defaultAccount, defaultCategories, defaultMember, defaultSettings } from '../domain/defaults';

describe('migración v1 → v2', () => {
  it('conserva los datos y añade los campos nuevos', async () => {
    const name = 'migration-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ members: 'id', accounts: 'id, ownerId', categories: 'id, kind', transactions: 'id, date, accountId, categoryId, memberId', settings: 'id' });
    await v1.open();
    const now = '2026-10-01T00:00:00Z';
    const { onboarded: _o, budgetMethod: _b, projection: _p, dismissedRecurring: _d, ...oldSettings } = defaultSettings('es');
    await v1.table('members').add(defaultMember('es', now));
    await v1.table('accounts').add(defaultAccount('es', now));
    await v1.table('categories').bulkAdd(defaultCategories().map(({ group: _g, ...c }) => c));
    await v1.table('settings').add(oldSettings);
    await v1.table('transactions').add({ id: 't1', type: 'expense', amountCents: 1250, currency: 'CAD', accountId: 'account-main', categoryId: 'cat-dining', date: '2026-10-05', note: 'x', memberId: null, createdAt: now, updatedAt: now });
    v1.close();

    const db = new FinanzasDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.transactions.get('t1')).toMatchObject({ amountCents: 1250 });
    const s = await db.settings.get('settings');
    expect(s).toMatchObject({ onboarded: true, budgetMethod: 'envelopes', dismissedRecurring: [] });
    expect(s?.projection.withdrawalRateBps).toBe(400);
    expect((await db.categories.get('cat-housing'))?.group).toBe('needs');
    expect((await db.categories.get('cat-salary'))?.group).toBeNull();
    expect(await db.goals.count()).toBe(0);
    await db.delete();
  });

  it('una base de datos nueva arranca con la bienvenida pendiente', async () => {
    const db = new FinanzasDB('fresh-test');
    await db.open();
    expect((await db.settings.get('settings'))?.onboarded).toBe(false);
    await db.delete();
  });
});
