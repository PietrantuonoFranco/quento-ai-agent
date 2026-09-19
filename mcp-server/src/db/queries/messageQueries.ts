import { getDb } from "../database";
import { message } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getMessageById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(message).where(eq(message.id, id)).limit(1);

  return result[0] || null;
}

export async function getMessagesByChatRoomId(env: Env, chatRoomId: number) {
  const db = getDb(env);

  return db.select().from(message).where(eq(message.chatRoomId, chatRoomId));
}

export async function createMessage(env: Env, values: typeof message.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(message).values(values).returning();

  return result[0];
}
