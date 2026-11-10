/**
 * CONTEXTO DE LA APP
 * ==================
 * Carga los datos de IndexedDB "en vivo" (cuando algo cambia, la pantalla se
 * actualiza sola) y los comparte con todos los componentes, junto con el
 * idioma, el formato de dinero y los avisos (toasts).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WorthSnapshot } from '../data/db';
import { formatMoney, type Cents, type CurrencyCode, type FormatOptions } from '../domain/money';
import { accountValue, netWorth, type AccountValue, type NetWorth } from '../domain/wealth';
import type {
  Account,
  BalanceSnapshot,
  Budget,
  Category,
  Contribution,
  Goal,
  Holding,
  Id,
  Locale,
  Member,
  RegisteredRoom,
  Settings,
  Transaction,
} from '../domain/types';
import { categoryLabel, translate, type MessageKey, type Params } from '../i18n';

export interface ToastAction {
  label: string;
  run: () => void;
}
interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

export interface AppState {
  settings: Settings;
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
  worth: WorthSnapshot[];
  /** Valor actual de cada cuenta (saldo o posiciones) y el patrimonio neto. */
  accountValues: AccountValue[];
  accountValueById: Map<Id, AccountValue>;
  netWorth: NetWorth;
  accountById: Map<Id, Account>;
  categoryById: Map<Id, Category>;
  memberById: Map<Id, Member>;
  locale: Locale;
  t: (key: MessageKey, params?: Params) => string;
  /** Formatea centavos; por defecto en la moneda base. */
  money: (cents: Cents, currency?: CurrencyCode, opts?: FormatOptions) => string;
  catName: (id: Id | null) => string;
  memberName: (id: Id | null) => string;
  toast: (message: string, action?: ToastAction) => void;
  /** Ejecuta una operación y muestra el error en un toast si falla. */
  run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp debe usarse dentro de <AppProvider>');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // useLiveQuery vuelve a ejecutar la consulta cada vez que cambian las tablas.
  const data = useLiveQuery(async () => {
    const [settings, members, accounts, categories, transactions, balances, budgets, goals, holdings, rooms, contributions, worth] =
      await Promise.all([
        db.settings.get('settings'),
        db.members.toArray(),
        db.accounts.toArray(),
        db.categories.toArray(),
        db.transactions.toArray(),
        db.balances.toArray(),
        db.budgets.toArray(),
        db.goals.toArray(),
        db.holdings.toArray(),
        db.rooms.toArray(),
        db.contributions.toArray(),
        db.worth.toArray(),
      ]);
    return { settings, members, accounts, categories, transactions, balances, budgets, goals, holdings, rooms, contributions, worth };
  });

  const [toastState, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((message: string, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, ...(action && { action }) });
    timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 2400);
  }, []);

  const value = useMemo<AppState | null>(() => {
    if (!data?.settings) return null;
    const { settings } = data;
    const locale = settings.locale;
    const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
    const categoryById = new Map(data.categories.map((c) => [c.id, c]));
    const memberById = new Map(data.members.map((m) => [m.id, m]));
    const accountValues = data.accounts.map((a) => accountValue(a, data.balances, data.holdings, settings));
    return {
      ...data,
      settings,
      // Primero la persona de este dispositivo; luego en orden de creación.
      members: [...data.members].sort(
        (a, b) => Number(b.id === settings.currentMemberId) - Number(a.id === settings.currentMemberId) || a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name),
      ),
      worth: [...data.worth].sort((a, b) => a.id.localeCompare(b.id)),
      accountValues,
      accountValueById: new Map(accountValues.map((v) => [v.account.id, v])),
      netWorth: netWorth(accountValues),
      categories: [...data.categories].sort((a, b) => a.order - b.order),
      accountById: new Map(data.accounts.map((a) => [a.id, a])),
      categoryById,
      memberById,
      locale,
      t,
      money: (cents, currency = settings.baseCurrency, opts) => formatMoney(cents, currency, opts),
      catName: (id) => {
        const c = id ? categoryById.get(id) : undefined;
        return c ? categoryLabel(locale, c) : t('dash.uncategorized');
      },
      memberName: (id) => (id ? (memberById.get(id)?.name ?? '?') : t('tx.shared')),
      toast,
      run: async (fn, success) => {
        try {
          await fn();
          if (success) toast(success);
          return true;
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e));
          return false;
        }
      },
    };
  }, [data, toast]);

  if (!value) return null; // primera carga: tarda milisegundos

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast${toastState ? ' show' : ''}`} role="status" aria-live="polite">
        {toastState && (
          <>
            <span>{toastState.message}</span>
            {toastState.action && (
              <button
                className="toast-btn"
                onClick={() => {
                  toastState.action?.run();
                  setToast(null);
                }}
              >
                {toastState.action.label}
              </button>
            )}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}
