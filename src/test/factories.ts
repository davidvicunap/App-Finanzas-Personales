/** Fábricas de datos para las pruebas: crean objetos válidos con valores por defecto. */
import type { Account, BalanceSnapshot, Goal, Holding, Transaction } from '../domain/types';
import type { FxSettings } from '../domain/stats';

let seq = 0;
const next = () => `id${++seq}`;

export const CAD_ONLY: FxSettings = { baseCurrency: 'CAD', fxRates: {} };
export const USD_140: FxSettings = {
  baseCurrency: 'CAD',
  fxRates: { USD: { rateMicros: 1_400_000, asOf: '2026-11-01', source: 'manual' } },
};

export function tx(p: Partial<Transaction> = {}): Transaction {
  const id = next();
  return {
    id,
    type: 'expense',
    amountCents: 1000,
    currency: 'CAD',
    accountId: 'a1',
    categoryId: 'cat-groceries',
    date: '2026-11-09',
    note: '',
    memberId: null,
    createdAt: `2026-01-01T00:00:00.${String(seq).padStart(3, '0')}Z`,
    updatedAt: '',
    ...p,
  };
}

export function account(p: Partial<Account> = {}): Account {
  return { id: next(), name: 'Cuenta', type: 'chequing', currency: 'CAD', ownerId: null, institution: '', archived: false, createdAt: '', ...p };
}

export function balance(p: Partial<BalanceSnapshot> & Pick<BalanceSnapshot, 'accountId'>): BalanceSnapshot {
  return { id: next(), date: '2026-11-01', balanceCents: 0, createdAt: `2026-01-01T00:00:00.${String(seq).padStart(3, '0')}Z`, ...p };
}

export function holding(p: Partial<Holding> & Pick<Holding, 'accountId'>): Holding {
  return {
    id: next(),
    symbol: 'VFV',
    assetClass: 'etf',
    currency: 'CAD',
    quantity: '10',
    unitPrice: '100',
    priceAsOf: '2026-11-08',
    multiplier: 1,
    costBasisCents: 90000,
    createdAt: '',
    ...p,
  };
}

export function goal(p: Partial<Goal> = {}): Goal {
  return {
    id: next(),
    name: 'Fondo de emergencia',
    emoji: '🛟',
    targetCents: 1_000_000,
    savedCents: 0,
    accountId: null,
    targetDate: null,
    ownerId: null,
    archived: false,
    createdAt: '',
    ...p,
  };
}
