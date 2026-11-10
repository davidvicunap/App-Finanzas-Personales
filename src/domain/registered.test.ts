import { describe, expect, it } from 'vitest';
import { roomId, roomSummary } from './registered';
import type { Contribution, RegisteredRoom } from './types';

const room = (cents: number): RegisteredRoom => ({ id: roomId('m1', 'tfsa', 2026), memberId: 'm1', type: 'tfsa', year: 2026, roomCents: cents });
const c = (amountCents: number, date = '2026-03-01', memberId = 'm1'): Contribution => ({ id: `${amountCents}${date}`, memberId, type: 'tfsa', date, amountCents, note: '', createdAt: '' });

describe('espacio de contribución', () => {
  it('resta aportes del año; los retiros no devuelven espacio el mismo año', () => {
    const s = roomSummary([room(1_000_000)], [c(300_000), c(-100_000, '2026-05-01'), c(200_000, '2026-06-01')], 'm1', 'tfsa', 2026);
    expect(s).toMatchObject({ roomCents: 1_000_000, contributedCents: 500_000, withdrawnCents: 100_000, remainingCents: 500_000, overContributed: false });
  });
  it('ignora otros años y otras personas', () => {
    const s = roomSummary([room(100)], [c(50, '2025-12-31'), c(50, '2026-01-01', 'm2')], 'm1', 'tfsa', 2026);
    expect(s.contributedCents).toBe(0);
  });
  it('marca sobre-contribución', () => {
    expect(roomSummary([room(100_000)], [c(150_000)], 'm1', 'tfsa', 2026).overContributed).toBe(true);
  });
  it('sin espacio registrado no inventa uno', () => {
    expect(roomSummary([], [c(1)], 'm1', 'tfsa', 2026)).toMatchObject({ roomCents: null, remainingCents: null });
  });
});
