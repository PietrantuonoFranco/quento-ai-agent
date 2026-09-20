import { getDb } from "../database";
import { schedule } from "../schemas";
import { and, eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getScheduleById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(schedule).where(eq(schedule.id, id)).limit(1);

  return result[0] || null;
}

export async function getSchedulesByCourtId(env: Env, courtId: number) {
  const db = getDb(env);

  return db.select().from(schedule).where(eq(schedule.courtId, courtId));
}

export async function createSchedule(env: Env, values: typeof schedule.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(schedule).values(values).returning();

  return result[0];
}

export async function getScheduleByCourtIdAndDay(env: Env, courtId: number, dayOfWeek: string) {
  const db = getDb(env);
  const result = await db
    .select()
    .from(schedule)
    .where(and(eq(schedule.courtId, courtId), eq(schedule.dayOfWeek, dayOfWeek)))
    .limit(1);

  return result[0] || null;
}

// openingTime/closingTime llegan de la columna "time" como strings "HH:MM:SS", comparables lexicográficamente.
export function isWithinOpeningHours(schedule: { openingTime: string; closingTime: string }, time: string) {
  return time >= schedule.openingTime && time <= schedule.closingTime;
}

export async function getAllSchedules(env: Env) {
  const db = getDb(env);

  return db.select().from(schedule);
}
