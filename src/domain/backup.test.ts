import { describe, expect, it } from 'vitest';
import { createBackup, csvAmount, csvCell, decryptText, encryptText, isEncryptedBackup, parseBackup, transactionsToCsv } from './backup';
import { defaultAccount, defaultCategories, defaultMember, defaultSettings } from './defaults';
import type { AppData, Transaction } from './types';

const tx: Transaction = {
  id: 't1',
  type: 'expense',
  amountCents: 1250,
  currency: 'CAD',
  accountId: 'account-main',
  categoryId: 'cat-groceries',
  date: '2026-11-09',
  note: 'Save-On-Foods',
  memberId: 'member-1',
  createdAt: '2026-11-09T10:00:00Z',
  updatedAt: '2026-11-09T10:00:00Z',
};

function sample(): AppData {
  const now = '2026-11-09T00:00:00Z';
  return {
    members: [defaultMember('es', now)],
    accounts: [defaultAccount('es', now)],
    categories: defaultCategories(),
    transactions: [structuredClone(tx)],
    balances: [],
    budgets: [],
    goals: [],
    holdings: [],
    rooms: [],
    contributions: [],
    settings: defaultSettings('es'),
  };
}

const wrap = (data: unknown) => JSON.stringify({ ...createBackup(sample()), data });

describe('parseBackup', () => {
  it('acepta un respaldo válido', () => {
    const r = parseBackup(JSON.stringify(createBackup(sample())));
    expect(r.ok).toBe(true);
  });

  it('rechaza JSON roto y archivos que no son respaldos', () => {
    expect(parseBackup('{nope').ok).toBe(false);
    expect(parseBackup('{"transactions": []}').ok).toBe(false);
  });

  it('rechaza un id que intenta inyectar código (XSS)', () => {
    const bad = sample();
    bad.transactions[0]!.id = "x'+(window.pwned=1)+'";
    expect(parseBackup(wrap(bad)).ok).toBe(false);
  });

  it('rechaza montos en texto, decimales o negativos', () => {
    for (const amount of ['10', 12.5, -100, 0]) {
      const bad = sample() as unknown as { transactions: Record<string, unknown>[] };
      bad.transactions[0]!.amountCents = amount;
      expect(parseBackup(wrap(bad)).ok).toBe(false);
    }
  });

  it('rechaza fechas imposibles y movimientos sin cuenta', () => {
    const badDate = sample();
    badDate.transactions[0]!.date = '2026-02-30';
    expect(parseBackup(wrap(badDate)).ok).toBe(false);

    const orphan = sample();
    orphan.transactions[0]!.accountId = 'ghost';
    const r = parseBackup(wrap(orphan));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cuenta inexistente');
  });

  it('rechaza respaldos de una versión futura', () => {
    const future = { ...createBackup(sample()), version: 99 };
    expect(parseBackup(JSON.stringify(future)).ok).toBe(false);
  });
});

describe('CSV', () => {
  it('formatea montos sin floats', () => {
    expect(csvAmount(123450)).toBe('1234.50');
    expect(csvAmount(-5)).toBe('-0.05');
  });

  it('escapa comillas, comas y neutraliza fórmulas de Excel', () => {
    expect(csvCell('Café, "rico"')).toBe('"Café, ""rico"""');
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('normal')).toBe('normal');
  });

  it('genera filas con gastos negativos', () => {
    const csv = transactionsToCsv([tx], {
      account: () => 'Cuenta principal',
      category: () => 'Supermercado',
      member: () => 'Yo',
    });
    const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
    expect(lines[0]).toBe('date,type,amount,currency,category,account,member,note');
    expect(lines[1]).toBe('2026-11-09,expense,-12.50,CAD,Supermercado,Cuenta principal,Yo,Save-On-Foods');
  });
});

describe('compatibilidad con respaldos v1', () => {
  it('un respaldo de la fase 1 se restaura con las tablas nuevas vacías', () => {
    const v1 = sample() as unknown as Record<string, unknown>;
    for (const k of ['balances', 'budgets', 'goals', 'holdings', 'rooms', 'contributions']) delete v1[k];
    v1.categories = (v1.categories as Record<string, unknown>[]).map(({ group: _g, ...c }) => c);
    const s = v1.settings as Record<string, unknown>;
    for (const k of ['onboarded', 'budgetMethod', 'projection', 'dismissedRecurring']) delete s[k];
    const r = parseBackup(JSON.stringify({ format: 'mis-finanzas-backup', version: 1, exportedAt: '', data: v1 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.goals).toEqual([]);
      expect(r.data.settings.onboarded).toBe(true);
      expect(r.data.categories.find((c) => c.id === 'cat-housing')?.group).toBe('needs');
    }
  });

  it('rechaza una posición con cantidad que no es decimal', () => {
    const bad = sample();
    bad.holdings.push({ id: 'h1', accountId: 'account-main', symbol: 'X', assetClass: 'stock', currency: 'USD', quantity: '1e5', unitPrice: '1', priceAsOf: '2026-11-01', multiplier: 1, costBasisCents: 0, createdAt: '' });
    expect(parseBackup(JSON.stringify(createBackup(bad))).ok).toBe(false);
  });
});

describe('respaldo cifrado', () => {
  it('cifra y descifra; con otra contraseña falla', async () => {
    const plain = JSON.stringify(createBackup(sample()));
    const enc = await encryptText(plain, 'contraseña-larga');
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc).not.toContain('Save-On-Foods');
    expect(await decryptText(enc, 'contraseña-larga')).toBe(plain);
    await expect(decryptText(enc, 'otra-contraseña')).rejects.toThrow('Contraseña incorrecta');
  });

  it('exige contraseñas de al menos 8 caracteres', async () => {
    await expect(encryptText('x', 'corta')).rejects.toThrow();
  });
});
