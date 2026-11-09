import { describe, expect, it } from 'vitest';
import { fiNumber, monthlyRate, monthsToTarget, project, projectionTable } from './projection';

describe('proyecciones', () => {
  it('la tasa mensual compone exactamente a la anual', () => {
    expect(Math.pow(1 + monthlyRate(500), 12)).toBeCloseTo(1.05, 10);
  });

  it('0 % de rendimiento = solo aportes', () => {
    expect(project(100_000, 10_000, 0, 12).at(-1)).toBe(220_000);
  });

  it('interés compuesto: $10,000 al 5 % durante 10 años ≈ $16,288.95', () => {
    const v = project(1_000_000, 0, 500, 120).at(-1)!;
    expect(Math.abs(v - 1_628_895)).toBeLessThanOrEqual(5); // redondeo mensual
    expect(Number.isInteger(v)).toBe(true);
  });

  it('tabla con escenarios y horizontes', () => {
    const t = projectionTable(0, 50_000, [
      { key: 'conservative', annualBps: 300 },
      { key: 'base', annualBps: 500 },
      { key: 'optimistic', annualBps: 700 },
    ]);
    expect(t.map((r) => r.years)).toEqual([5, 10, 20, 30]);
    const r10 = t[1]!;
    expect(r10.contributedCents).toBe(6_000_000);
    expect(r10.values.conservative).toBeLessThan(r10.values.base);
    expect(r10.values.base).toBeLessThan(r10.values.optimistic);
  });

  it('número FI con la regla del 4 % = gasto anual × 25', () => {
    expect(fiNumber(6_000_000, 400)).toBe(150_000_000);
    expect(() => fiNumber(1, 0)).toThrow();
  });

  it('meses hasta la meta', () => {
    expect(monthsToTarget(100, 0, 500, 50)).toBe(0);
    expect(monthsToTarget(0, 1000, 0, 12_000)).toBe(12);
    expect(monthsToTarget(0, 0, 500, 100)).toBeNull();
  });
});
