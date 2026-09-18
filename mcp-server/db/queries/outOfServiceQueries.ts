import { getDb } from "../database";
import { outOfService } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

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
