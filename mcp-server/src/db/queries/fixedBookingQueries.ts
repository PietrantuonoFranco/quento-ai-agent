import { getDb } from "../database";
import { booking, court, fixedBooking, fixedBookingDate } from "../schemas";
import { and, asc, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import BookingState from "../../lib/enums/bookingState";
import FixedBookingDateState from "../../lib/enums/fixedBookingDateState";

export async function getFixedBookingById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(fixedBooking).where(eq(fixedBooking.id, id)).limit(1);

  return result[0] || null;
}

// Turnos fijos activos de un booker, con el número de cancha.
export async function getActiveFixedBookingsByBookerId(env: Env, bookerId: number) {
  const db = getDb(env);

  return db
    .select({ ...getTableColumns(fixedBooking), courtNumber: court.number })
    .from(fixedBooking)
    .innerJoin(court, eq(fixedBooking.courtId, court.id))
    .where(and(eq(fixedBooking.bookerId, bookerId), eq(fixedBooking.isActive, true)))
    .orderBy(asc(fixedBooking.startDate), asc(fixedBooking.startTime));
}

// La fecha de turno fijo reservada con ese turno, si el turno es una de ellas.
export async function getBookedFixedBookingDateByBookingId(env: Env, bookingId: number) {
  const db = getDb(env);
  const result = await db
    .select()
    .from(fixedBookingDate)
    .where(and(eq(fixedBookingDate.bookingId, bookingId), eq(fixedBookingDate.state, FixedBookingDateState.BOOKED)))
    .limit(1);

  return result[0] || null;
}

// Libera una sola fecha del turno fijo, como releaseFixedBookingDate de la web: cancela su
// turno y la marca liberada (así la extensión automática no la vuelve a generar).
export async function releaseFixedBookingDate(env: Env, fixedBookingDateId: number, bookingId: number) {
  const db = getDb(env);

  await db.transaction(async (tx) => {
    await tx.update(booking).set({ bookingState: BookingState.CANCELLED }).where(eq(booking.id, bookingId));
    await tx
      .update(fixedBookingDate)
      .set({ state: FixedBookingDateState.RELEASED })
      .where(eq(fixedBookingDate.id, fixedBookingDateId));
  });
}

// Da de baja el turno fijo, como cancelFixedBooking de la web: deja de generar fechas y
// cancela y libera las reservadas que todavía no empezaron (`now` en hora de pared del club).
// Devuelve cuántas fechas canceló.
export async function cancelFixedBooking(env: Env, fixedBookingId: number, now: Date) {
  const db = getDb(env);

  return db.transaction(async (tx) => {
    await tx.update(fixedBooking).set({ isActive: false }).where(eq(fixedBooking.id, fixedBookingId));

    const future = await tx
      .select({ dateId: fixedBookingDate.id, bookingId: booking.id })
      .from(fixedBookingDate)
      .innerJoin(booking, eq(fixedBookingDate.bookingId, booking.id))
      .where(
        and(
          eq(fixedBookingDate.fixedBookingId, fixedBookingId),
          eq(fixedBookingDate.state, FixedBookingDateState.BOOKED),
          gt(booking.datetime, sql`${now.toISOString()}::timestamp`),
        ),
      );

    if (future.length === 0) return 0;

    await tx
      .update(booking)
      .set({ bookingState: BookingState.CANCELLED })
      .where(inArray(booking.id, future.map((row) => row.bookingId)));
    await tx
      .update(fixedBookingDate)
      .set({ state: FixedBookingDateState.RELEASED })
      .where(inArray(fixedBookingDate.id, future.map((row) => row.dateId)));

    return future.length;
  });
}
