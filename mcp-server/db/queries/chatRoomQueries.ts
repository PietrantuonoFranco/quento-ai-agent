import { getDb } from "../database";
import { chatRoom, message } from "../schemas";
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

export async function listChatRoomMessages(env: Env, chatRoomId: number) {
  const db = getDb(env);

  return db.select().from(message).where(eq(message.chatRoomId, chatRoomId));
}

export async function addMessageToChatRoom(env: Env, values: typeof message.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(message).values(values).returning();

  return result[0];
}
