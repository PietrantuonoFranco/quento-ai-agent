import { getDb } from "../database";
import { player } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getPlayerById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(player).where(eq(player.id, id)).limit(1);

  return result[0] || null;
}

export async function getPlayerByAccountId(env: Env, accountId: number) {
  const db = getDb(env);
  const result = await db.select().from(player).where(eq(player.accountId, accountId)).limit(1);

  return result[0] || null;
}

export async function createPlayer(env: Env, values: typeof player.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(player).values(values).returning();

  return result[0];
}

export async function getPlayerByBookerId(env: Env, bookerId: number) {
  const db = getDb(env);
  const result = await db.select().from(player).where(eq(player.bookerId, bookerId)).limit(1);

  return result[0] || null;
}
