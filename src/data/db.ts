/**
 * BASE DE DATOS LOCAL (IndexedDB vía Dexie)
 * =========================================
 * Los datos viven en el dispositivo, dentro de IndexedDB: más capacidad y más
 * robusto que localStorage. En la fase 4 se añadirá la sincronización cifrada
 * con tu pareja, sobre estas mismas tablas.
 *
 * CÓMO CAMBIAR EL ESQUEMA (migraciones)
 * -------------------------------------
 * Nunca edites una versión existente. Añade una nueva debajo, por ejemplo:
 *
 *   this.version(2)
 *     .stores({ budgets: 'id, month' })          // tablas nuevas o índices
 *     .upgrade(async (tx) => {                   // transformar datos viejos
 *       await tx.table('transactions').toCollection().modify((t) => { t.tags = []; });
 *     });
 *
 * Dexie aplica en orden las versiones que falten en cada dispositivo.
 */
import Dexie, { type EntityTable } from 'dexie';
import { defaultAccount, defaultCategories, defaultMember, defaultSettings, detectLocale } from '../domain/defaults';
import type { Account, Category, Member, Settings, Transaction } from '../domain/types';

export class FinanzasDB extends Dexie {
  members!: EntityTable<Member, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'mis-finanzas') {
    super(name);

    // Versión 1. En `stores` solo se listan la clave y los campos por los que
    // se busca (índices); los demás campos se guardan igual.
    this.version(1).stores({
      members: 'id',
      accounts: 'id, ownerId',
      categories: 'id, kind',
      transactions: 'id, date, accountId, categoryId, memberId',
      settings: 'id',
    });

    // Se ejecuta UNA vez, al crear la base de datos por primera vez.
    this.on('populate', async (tx) => {
      const locale = detectLocale();
      const now = new Date().toISOString();
      await tx.table('members').add(defaultMember(locale, now));
      await tx.table('accounts').add(defaultAccount(locale, now));
      await tx.table('categories').bulkAdd(defaultCategories());
      await tx.table('settings').add(defaultSettings(locale));
    });
  }
}

/** La base de datos que usa la app. Las pruebas crean la suya propia. */
export const db = new FinanzasDB();

/** Pide al navegador no borrar los datos aunque falte espacio (Safari es agresivo). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
