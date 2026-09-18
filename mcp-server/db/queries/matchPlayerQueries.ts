import { getDb } from "../database";
import { matchPlayer } from "../schemas";
import { and, eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getMatchPlayersByMatchId(env: Env, matchId: number) {
  const db = getDb(env);

  return db.select().from(matchPlayer).where(eq(matchPlayer.matchId, matchId));
}

export async function getMatchPlayersByPlayerId(env: Env, playerId: number) {
  const db = getDb(env);

  return db.select().from(matchPlayer).where(eq(matchPlayer.playerId, playerId));
}

export async function createMatchPlayer(env: Env, values: typeof matchPlayer.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(matchPlayer).values(values).returning();

  return result[0];
}

export async function deleteMatchPlayer(env: Env, matchId: number, playerId: number) {
  const db = getDb(env);

  return db
    .delete(matchPlayer)
    .where(and(eq(matchPlayer.matchId, matchId), eq(matchPlayer.playerId, playerId)));
}
