import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  convertCents,
  formatMoney,
  formatRate,
  marketValueCents,
  mulDivCents,
  parseAmount,
  parseDecimal,
  parseRate,
  ratio,
  sumCents,
} from './money';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,5', 1250], // teclado iPhone en español
    ['0.99', 99],
    ['.5', 50],
    ['1,234', 123400], // miles con coma
    ['1,234.56', 123456],
    ['1.234,56', 123456], // formato europeo
    ['1 234,56', 123456], // espacio como separador de miles
    ['$8', 800],
    ['US$ 3.20', 320],
    ['  45  ', 4500],
    ['1,234,567.89', 123456789],
  ])('"%s" → %i centavos', (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  it.each(['', 'abc', '12.345', '1.234', '1,2,3', '-5', '12..5', '$', '1e5', '99999999999999'])(
    'rechaza "%s"',
    (text) => {
      expect(parseAmount(text)).toBeNull();
    },
  );

  it('nunca produce errores de float', () => {
    // 0.1 + 0.2 en floats da 0.30000000000000004; en centavos, exacto.
    expect(sumCents([parseAmount('0.1')!, parseAmount('0.2')!])).toBe(30);
  });
});

describe('sumCents', () => {
  it('suma exacta, incluido el caso que producía "-$0"', () => {
    expect(sumCents([30, -10, -20])).toBe(0);
    expect(sumCents([])).toBe(0);
  });
  it('rechaza valores que no son enteros', () => {
    expect(() => sumCents([10, 0.5])).toThrow();
  });
});

describe('formatMoney', () => {
  it('formato canadiense', () => {
    expect(formatMoney(123450, 'CAD')).toBe('$1,234.50');
    expect(formatMoney(3600, 'CAD')).toBe('$36');
    expect(formatMoney(3600, 'CAD', { cents: 'always' })).toBe('$36.00');
    expect(formatMoney(-1250, 'CAD')).toBe('-$12.50');
  });
  it('distingue USD de CAD', () => {
    expect(formatMoney(1250, 'USD')).toBe('US$12.50');
  });
  it('cero nunca sale como "-$0"', () => {
    expect(formatMoney(0, 'CAD')).toBe('$0');
    expect(formatMoney(0, 'CAD', { sign: 'always' })).toBe('$0');
  });
  it('signo explícito para ingresos', () => {
    expect(formatMoney(500, 'CAD', { sign: 'always' })).toBe('+$5');
  });
  it('formato compacto', () => {
    expect(formatMoney(123_456_00, 'CAD', { compact: true })).toBe('$123.5K');
  });
});

describe('centsToInput', () => {
  it('genera texto editable', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(5)).toBe('0.05');
  });
  it('ida y vuelta con parseAmount', () => {
    for (const c of [1, 99, 100, 12345, 99999999]) expect(parseAmount(centsToInput(c))).toBe(c);
  });
});

describe('tipos de cambio', () => {
  it('parseRate / formatRate', () => {
    expect(parseRate('1.3725')).toBe(1_372_500);
    expect(parseRate('1,37')).toBe(1_370_000);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('1.1234567')).toBeNull();
    expect(formatRate(1_372_500)).toBe('1.3725');
    expect(formatRate(1_000_000)).toBe('1');
  });

  it('convertCents redondea al centavo más cercano', () => {
    // US$100.00 a 1.3725 → C$137.25
    expect(convertCents(10000, 1_372_500)).toBe(13725);
    // 1 centavo a 1.5 = 1.5 → 2 (mitad se aleja de cero)
    expect(convertCents(1, 1_500_000)).toBe(2);
    expect(convertCents(-1, 1_500_000)).toBe(-2);
    // 1 centavo a 1.4 = 1.4 → 1
    expect(convertCents(1, 1_400_000)).toBe(1);
  });

  it('no pierde precisión con montos grandes', () => {
    // 10 millones de dólares a 1.372501
    expect(convertCents(1_000_000_000, 1_372_501)).toBe(1_372_501_000);
  });
});

describe('ratio', () => {
  it('maneja total 0', () => {
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(25, 100)).toBe(0.25);
  });
});

describe('decimales exactos (inversiones)', () => {
  it('parseDecimal', () => {
    expect(parseDecimal('12.345')).toEqual({ value: 12345n, scale: 3 });
    expect(parseDecimal('0,5')).toEqual({ value: 5n, scale: 1 });
    expect(parseDecimal('.25')).toEqual({ value: 25n, scale: 2 });
    expect(parseDecimal('10')).toEqual({ value: 10n, scale: 0 });
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('0.12345678901')).toBeNull(); // más de 10 decimales
  });

  it('marketValueCents sin errores de float', () => {
    expect(marketValueCents('10', '187.43')).toBe(187430);
    expect(marketValueCents('0.5', '64000.10')).toBe(3200005);
    // 0.1 × 0.2 en floats = 0.020000000000000004
    expect(marketValueCents('0.1', '0.2')).toBe(2);
    // 3 contratos de opciones a 2.15 × 100
    expect(marketValueCents('3', '2.15', 100)).toBe(64500);
    // satoshis: 0.00012345 BTC a 90,000.00
    expect(marketValueCents('0.00012345', '90000')).toBe(1111); // 11.1105 → $11.11
  });

  it('mulDivCents', () => {
    expect(mulDivCents(100000, 50, 100)).toBe(50000);
    expect(mulDivCents(1, 1, 2)).toBe(1); // 0.5 → 1
    expect(mulDivCents(-1, 1, 2)).toBe(-1);
  });
});
