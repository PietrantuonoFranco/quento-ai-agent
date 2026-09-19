import { getDb } from "../database";
import { booking, outOfService } from "../schemas";
import { and, eq, ne, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import BookingState from "../../lib/enums/bookingState";

export async function getOutOfServiceById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(outOfService).where(eq(outOfService.id, id)).limit(1);

  return result[0] || null;
}

export async function getOutOfServicesByCourtId(env: Env, courtId: number) {
  const db = getDb(env);

  return db.select().from(outOfService).where(eq(outOfService.courtId, courtId));
}

export async function createOutOfService(env: Env, values: typeof outOfService.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(outOfService).values(values).returning();

  return result[0];
}

export function isOutOfServiceActive(record: { fromDatetime: Date; toDatetime: Date }, now: Date = new Date()) {
  return now >= record.fromDatetime && now <= record.toDatetime;
}

export async function cancelBookingsAffectedByOutOfService(env: Env, outOfServiceId: number) {
  const db = getDb(env);
  const record = await getOutOfServiceById(env, outOfServiceId);

  if (!record) return [];

  return db
    .update(booking)
    .set({ bookingState: BookingState.CANCELLED, updatedAt: new Date() })
    .where(
      and(
        eq(booking.courtId, record.courtId),
        ne(booking.bookingState, BookingState.CANCELLED),
        sql`${booking.datetime} < ${record.toDatetime.toISOString()}::timestamp`,
        sql`${booking.datetime} + (${booking.durationMinutes} || ' minutes')::interval > ${record.fromDatetime.toISOString()}::timestamp`,
      ),
    )
    .returning();
}
