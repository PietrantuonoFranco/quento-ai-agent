import { getDb } from "../database";
import { booking } from "../schemas";
import { and, eq, ne, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import BookingState from "../../lib/enums/bookingState";

export async function getBookingById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(booking).where(eq(booking.id, id)).limit(1);

  return result[0] || null;
}

export async function getBookingsByCourtId(env: Env, courtId: number) {
  const db = getDb(env);

  return db.select().from(booking).where(eq(booking.courtId, courtId));
}

export async function createBooking(env: Env, values: typeof booking.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(booking).values(values).returning();

  return result[0];
}

export async function cancelBooking(env: Env, id: number) {
  const db = getDb(env);
  const result = await db
    .update(booking)
    .set({ bookingState: BookingState.CANCELLED, updatedAt: new Date() })
    .where(eq(booking.id, id))
    .returning();

  return result[0] || null;
}

// Cuenta las reservas no canceladas de esa cancha que se solapan con el rango pedido; 0 = disponible.
export async function checkBookingAvailability(env: Env, courtId: number, datetime: Date, durationMinutes: number) {
  const db = getDb(env);
  const end = new Date(datetime.getTime() + durationMinutes * 60000);

  const overlapping = await db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.courtId, courtId),
        ne(booking.bookingState, BookingState.CANCELLED),
        sql`${booking.datetime} < ${end.toISOString()}::timestamp`,
        sql`${booking.datetime} + (${booking.durationMinutes} || ' minutes')::interval > ${datetime.toISOString()}::timestamp`,
      ),
    );

  return overlapping.length;
}
