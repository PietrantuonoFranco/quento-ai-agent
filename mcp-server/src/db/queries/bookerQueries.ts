import { getDb } from "../database";
import { booker } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getBookerById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(booker).where(eq(booker.id, id)).limit(1);

  return result[0] || null;
}

export async function getBookerByPhoneNumber(env: Env, phoneNumber: string) {
  const db = getDb(env);
  const result = await db.select().from(booker).where(eq(booker.phoneNumber, phoneNumber)).limit(1);

  return result[0] || null;
}

export async function createBooker(env: Env, values: typeof booker.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(booker).values(values).returning();

  return result[0];
}
