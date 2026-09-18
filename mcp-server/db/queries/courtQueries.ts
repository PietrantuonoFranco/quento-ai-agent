import { getDb } from "../database";
import { court, outOfService } from "../schemas";
import { and, eq, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import CourtState from "../../lib/enums/courtState";
import { checkBookingAvailability } from "./bookingQueries";

export async function getCourtById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(court).where(eq(court.id, id)).limit(1);

  return result[0] || null;
}

export async function getCourtByNumber(env: Env, number: number) {
  const db = getDb(env);
  const result = await db.select().from(court).where(eq(court.number, number)).limit(1);

  return result[0] || null;
}

export async function createCourt(env: Env, values: typeof court.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(court).values(values).returning();

  return result[0];
}

export async function blockCourt(env: Env, id: number) {
  const db = getDb(env);
  const result = await db
    .update(court)
    .set({ state: CourtState.OUT_OF_SERVICE, updatedAt: new Date() })
    .where(eq(court.id, id))
    .returning();

  return result[0] || null;
}

export async function unblockCourt(env: Env, id: number) {
  const db = getDb(env);
  const result = await db
    .update(court)
    .set({ state: CourtState.AVAILABLE, updatedAt: new Date() })
    .where(eq(court.id, id))
    .returning();

  return result[0] || null;
}

// Cuenta conflictos (fuera de servicio + reservas solapadas) para el rango pedido; 0 = disponible.
export async function checkCourtAvailability(env: Env, courtId: number, datetime: Date, durationMinutes: number) {
  const db = getDb(env);
  const courtRow = await getCourtById(env, courtId);

  if (!courtRow || courtRow.state !== CourtState.AVAILABLE) return 1;

  const end = new Date(datetime.getTime() + durationMinutes * 60000);

  const activeOutOfService = await db
    .select()
    .from(outOfService)
    .where(
      and(
        eq(outOfService.courtId, courtId),
        sql`${outOfService.fromDatetime} < ${end}`,
        sql`${outOfService.toDatetime} > ${datetime}`,
      ),
    );

  const conflictingBookings = await checkBookingAvailability(env, courtId, datetime, durationMinutes);

  return activeOutOfService.length + conflictingBookings;
}
