import { describe, expect, it } from 'vitest';
import { accountValue, allocation, holdingRow, latestBalance, netWorth, portfolioSummary } from './wealth';
import { account, balance, CAD_ONLY, holding, USD_140 } from '../test/factories';

describe('saldos y patrimonio', () => {
  const chq = account({ type: 'chequing' });
  const visa = account({ type: 'credit_card' });
  const tfsa = account({ type: 'tfsa' });
  const usd = account({ type: 'savings', currency: 'USD' });

  it('latestBalance toma el más reciente, respetando la fecha límite', () => {
    const bs = [balance({ accountId: chq.id, date: '2026-10-01', balanceCents: 100 }), balance({ accountId: chq.id, date: '2026-11-01', balanceCents: 200 })];
    expect(latestBalance(bs, chq.id)?.balanceCents).toBe(200);
    expect(latestBalance(bs, chq.id, '2026-10-15')?.balanceCents).toBe(100);
  });

  it('las deudas restan y las inversiones usan sus posiciones', () => {
    const balances = [
      balance({ accountId: chq.id, balanceCents: 500_000 }),
      balance({ accountId: visa.id, balanceCents: 120_000 }),
      balance({ accountId: tfsa.id, balanceCents: 1 }), // se ignora: la TFSA tiene posiciones
    ];
    const holdings = [holding({ accountId: tfsa.id, quantity: '10', unitPrice: '150.25', costBasisCents: 120_000 })];
    const values = [chq, visa, tfsa].map((a) => accountValue(a, balances, holdings, CAD_ONLY));
    expect(values.map((v) => v.baseCents)).toEqual([500_000, -120_000, 150_250]);
    const nw = netWorth(values);
    expect(nw).toMatchObject({ assetsCents: 650_250, liabilitiesCents: 120_000, netCents: 530_250, investableCents: 150_250, cashCents: 500_000, unconverted: 0 });
  });

  it('cuenta en USD: se convierte, o se marca si falta el tipo de cambio', () => {
    const balances = [balance({ accountId: usd.id, balanceCents: 10_000 })];
    expect(accountValue(usd, balances, [], USD_140).baseCents).toBe(14_000);
    const v = accountValue(usd, balances, [], CAD_ONLY);
    expect(v.baseCents).toBeNull();
    expect(netWorth([v]).unconverted).toBe(1);
  });

  it('una cuenta sin datos vale 0 y se marca', () => {
    expect(accountValue(chq, [], [], CAD_ONLY)).toMatchObject({ cents: 0, source: 'none', asOf: null });
  });
});

describe('portafolio', () => {
  const tfsa = account({ type: 'tfsa' });
  const rows = [
    holding({ accountId: tfsa.id, symbol: 'VFV', quantity: '10', unitPrice: '150', costBasisCents: 100_000 }),
    holding({ accountId: tfsa.id, symbol: 'AAPL', assetClass: 'stock', currency: 'USD', quantity: '2', unitPrice: '200', costBasisCents: 50_000 }),
    holding({ accountId: tfsa.id, symbol: 'AAPL C', assetClass: 'option', currency: 'USD', quantity: '1', unitPrice: '1.50', multiplier: 100, costBasisCents: 25_000 }),
  ].map((h) => holdingRow(h, USD_140));

  it('ganancia por posición en su moneda y en CAD', () => {
    expect(rows[0]).toMatchObject({ valueCents: 150_000, gainCents: 50_000, gainRatio: 0.5 });
    expect(rows[1]).toMatchObject({ valueCents: 40_000, gainCents: -10_000, baseValueCents: 56_000, baseGainCents: -14_000 });
    expect(rows[2]).toMatchObject({ valueCents: 15_000, gainCents: -10_000 });
  });

  it('resumen: totales por moneda y combinados en CAD', () => {
    const s = portfolioSummary(rows, USD_140);
    expect(s.byCurrency.USD).toEqual({ valueCents: 55_000, costCents: 75_000, gainCents: -20_000 });
    expect(s.byCurrency.CAD).toEqual({ valueCents: 150_000, costCents: 100_000, gainCents: 50_000 });
    expect(s.baseValueCents).toBe(150_000 + 77_000);
    expect(s.baseGainCents).toBe(50_000 - 28_000);
  });

  it('asignación por tipo de activo', () => {
    const a = allocation(rows, 'assetClass');
    expect(a.map((x) => x.key)).toEqual(['etf', 'stock', 'option']);
    expect(a.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });
});
