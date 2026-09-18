import { getDb } from "../database";
import { account } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getAccountById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(account).where(eq(account.id, id)).limit(1);

  return result[0] || null;
}

export async function getAccountByEmail(env: Env, email: string) {
  const db = getDb(env);
  const result = await db.select().from(account).where(eq(account.email, email)).limit(1);

  return result[0] || null;
}

export async function createAccount(env: Env, values: typeof account.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(account).values(values).returning();

  return result[0];
}
