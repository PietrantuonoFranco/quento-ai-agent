import { getDb } from "../database";
import { account } from "../schemas";
import { and, eq } from "drizzle-orm";
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

export async function getAccountByEmailAndPassword(env: Env, email: string, passwordHashed: string) {
  const db = getDb(env);
  const result = await db
    .select()
    .from(account)
    .where(and(eq(account.email, email), eq(account.passwordHashed, passwordHashed)))
    .limit(1);

  return result[0] || null;
}

export async function blockAccount(env: Env, id: number) {
  const db = getDb(env);
  const result = await db
    .update(account)
    .set({ isBlock: true, updatedAt: new Date() })
    .where(eq(account.id, id))
    .returning();

  return result[0] || null;
}

export async function unblockAccount(env: Env, id: number) {
  const db = getDb(env);
  const result = await db
    .update(account)
    .set({ isBlock: false, updatedAt: new Date() })
    .where(eq(account.id, id))
    .returning();

  return result[0] || null;
}
