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
import { DEFAULT_GROUPS, defaultAccount, defaultCategories, defaultMember, defaultSettings, detectLocale } from '../domain/defaults';
import type {
  Account,
  BalanceSnapshot,
  Budget,
  Category,
  Contribution,
  Goal,
  Holding,
  Member,
  RegisteredRoom,
  Settings,
  Transaction,
} from '../domain/types';

/** Foto mensual del patrimonio (para el gráfico de evolución). Se guarda sola. */
export interface WorthSnapshot {
  /** El mes: 'YYYY-MM'. Una foto por mes; se actualiza durante el mes. */
  id: string;
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
  investableCents: number;
}

export class FinanzasDB extends Dexie {
  members!: EntityTable<Member, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  balances!: EntityTable<BalanceSnapshot, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  rooms!: EntityTable<RegisteredRoom, 'id'>;
  contributions!: EntityTable<Contribution, 'id'>;
  worth!: EntityTable<WorthSnapshot, 'id'>;

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

    // Versión 2: patrimonio, presupuestos, metas, inversiones y cuentas registradas.
    this.version(2)
      .stores({
        balances: 'id, accountId, date',
        budgets: 'id',
        goals: 'id',
        holdings: 'id, accountId',
        rooms: 'id, memberId',
        contributions: 'id, memberId, date',
        worth: 'id',
      })
      .upgrade(async (tx) => {
        // Categorías: clasificación 50/30/20 para las que vienen por defecto.
        await tx
          .table('categories')
          .toCollection()
          .modify((c: Category) => {
            if (c.group === undefined) c.group = c.kind === 'expense' && c.builtinKey ? (DEFAULT_GROUPS[c.builtinKey] ?? null) : null;
          });
        // Ajustes: campos nuevos. Quien ya usaba la app no necesita la bienvenida.
        const defaults = defaultSettings('es');
        await tx
          .table('settings')
          .toCollection()
          .modify((st: Settings) => {
            st.onboarded ??= true;
            st.budgetMethod ??= defaults.budgetMethod;
            st.projection ??= defaults.projection;
            st.dismissedRecurring ??= [];
          });
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
