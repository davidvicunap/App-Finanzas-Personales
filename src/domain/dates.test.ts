import { describe, expect, it } from 'vitest';
import {
  addDays,
  currentMonth,
  formatDay,
  formatMonth,
  isLocalDate,
  isYearMonth,
  lastMonths,
  shiftMonth,
  today,
} from './dates';

describe('fechas (las pruebas corren con TZ=America/Vancouver)', () => {
  it('la zona horaria de prueba es Vancouver', () => {
    // Si esto falla, las demás pruebas no están probando el caso difícil.
    // Vancouver está al oeste de UTC (UTC-7 u UTC-8 según el horario de verano).
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Vancouver');
    expect(new Date(2026, 10, 9).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('formatMonth no se corre un mes en zonas UTC-x (bug de la versión anterior)', () => {
    expect(formatMonth('2026-11', 'es')).toBe('noviembre de 2026');
    expect(formatMonth('2026-11', 'en')).toBe('November 2026');
    expect(formatMonth('2026-01', 'es', 'short')).toBe('ene');
  });

  it('formatDay usa el día correcto', () => {
    expect(formatDay('2026-11-09', 'en')).toBe('Monday, Nov 9');
  });

  it('today usa la hora local, no UTC', () => {
    // 9 nov 2026 a las 11 p. m. en Vancouver = 10 nov en UTC.
    const lateNight = new Date(2026, 10, 9, 23, 0);
    expect(today(lateNight)).toBe('2026-11-09');
    expect(currentMonth(lateNight)).toBe('2026-11');
  });

  it('valida fechas reales', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true); // bisiesto
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-1-01')).toBe(false);
    expect(isLocalDate(20261101)).toBe(false);
    expect(isYearMonth('2026-12')).toBe(true);
    expect(isYearMonth('2026-00')).toBe(false);
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // Cambio de horario (DST) en Vancouver: 1 nov 2026.
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('shiftMonth y lastMonths', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});
