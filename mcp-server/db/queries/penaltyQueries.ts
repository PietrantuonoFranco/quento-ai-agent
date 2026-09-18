import { getDb } from "../database";
import { penalty } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getPenaltyById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(penalty).where(eq(penalty.id, id)).limit(1);

  return result[0] || null;
}

export async function getPenaltiesByPlayerId(env: Env, playerId: number) {
  const db = getDb(env);

  return db.select().from(penalty).where(eq(penalty.playerId, playerId));
}

export async function createPenalty(env: Env, values: typeof penalty.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(penalty).values(values).returning();

  return result[0];
}
