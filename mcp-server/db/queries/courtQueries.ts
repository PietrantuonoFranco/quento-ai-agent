import { getDb } from "../database";
import { court } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

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
