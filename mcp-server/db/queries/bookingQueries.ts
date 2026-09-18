import { getDb } from "../database";
import { booking } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

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
