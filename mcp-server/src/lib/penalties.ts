// Reglas de penalización copiadas de la web (padel-quento: src/domain/constants.ts,
// src/domain/late-cancellation.ts y recordPointsMovement). Los motivos tienen que
// ser idénticos a los de la web: su reporte de asistencia cuenta las penalidades por motivo.

// Por debajo de esta antelación, cancelar un turno o bajarse de un partido es tardío (RN-03).
export const LATE_CANCELLATION_HOURS = 3;

// Puntos que se descuentan por una cancelación o baja tardía.
export const PENALTY_POINTS = 20;

export const LATE_CANCELLATION_REASON = "Cancelación con menos de 3 horas de anticipación";
export const LATE_LEAVE_REASON = "Baja de un partido con menos de 3 horas de anticipación";

// Tardía si faltan menos de LATE_CANCELLATION_HOURS para el turno, o si ya empezó.
// Ambas fechas en hora de pared del club (ver nowInClubTime).
export function isLateCancellation(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() < LATE_CANCELLATION_HOURS * 60 * 60_000;
}

// Monto (negativo) a registrar: el saldo nunca baja de 0, así que solo se descuenta lo
// que el jugador tiene. Sin saldo da 0, y la penalidad igual se registra para el historial.
export function penaltyAmount(balance: number, points: number): number {
  const amount = Math.min(points, Math.max(balance, 0));

  return amount === 0 ? 0 : -amount;
}
