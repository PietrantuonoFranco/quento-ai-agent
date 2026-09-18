import { getDb } from "../database";
import { chatRoom } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getChatRoomById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(chatRoom).where(eq(chatRoom.id, id)).limit(1);

  return result[0] || null;
}

export async function getChatRoomByMatchId(env: Env, matchId: number) {
  const db = getDb(env);
  const result = await db.select().from(chatRoom).where(eq(chatRoom.matchId, matchId)).limit(1);

  return result[0] || null;
}

export async function createChatRoom(env: Env, values: typeof chatRoom.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(chatRoom).values(values).returning();

  return result[0];
}
