/**
 * ESPACIO DE CONTRIBUCIÓN: TFSA, RRSP Y FHSA
 * ==========================================
 * La app NO calcula tu espacio desde cero: las reglas de CRA dependen de tu
 * historial (años de residencia, ingresos, retiros, factor de pensión…).
 * Tú escribes el espacio disponible al 1 de enero que muestra CRA My Account
 * (o tu Notice of Assessment), y la app resta lo que aportes durante el año.
 *
 * Reglas que sí se aplican aquí:
 *  - Un retiro NO devuelve espacio en el mismo año (en TFSA vuelve el 1 de enero
 *    siguiente, y ya vendrá incluido en el número que te dé CRA).
 *  - Si aportas más que tu espacio, se marca como sobre-contribución.
 *
 * Simplificación: los aportes a RRSP en los primeros 60 días del año pueden
 * deducirse en el año anterior; aquí se cuentan en el año calendario del aporte.
 */
import { sumCents, type Cents } from './money';
import type { Contribution, Id, RegisteredRoom, RegisteredType } from './types';

export function roomId(memberId: Id, type: RegisteredType, year: number): string {
  return `${memberId}:${type}:${year}`;
}

export interface RoomSummary {
  type: RegisteredType;
  year: number;
  /** Espacio al 1 de enero (lo escribes tú). null si no lo has escrito. */
  roomCents: Cents | null;
  contributedCents: Cents;
  withdrawnCents: Cents;
  /** Espacio que te queda este año. null si no hay espacio registrado. */
  remainingCents: Cents | null;
  overContributed: boolean;
}

export function roomSummary(
  rooms: readonly RegisteredRoom[],
  contributions: readonly Contribution[],
  memberId: Id,
  type: RegisteredType,
  year: number,
): RoomSummary {
  const room = rooms.find((r) => r.id === roomId(memberId, type, year));
  const mine = contributions.filter((c) => c.memberId === memberId && c.type === type && c.date.startsWith(`${year}-`));
  const contributedCents = sumCents(mine.filter((c) => c.amountCents > 0).map((c) => c.amountCents));
  const withdrawnCents = sumCents(mine.filter((c) => c.amountCents < 0).map((c) => -c.amountCents));
  const remainingCents = room ? room.roomCents - contributedCents : null;
  return {
    type,
    year,
    roomCents: room ? room.roomCents : null,
    contributedCents,
    withdrawnCents,
    remainingCents,
    overContributed: remainingCents !== null && remainingCents < 0,
  };
}
