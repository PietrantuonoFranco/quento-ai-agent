import { getDb } from "../database";
import { admin } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getAdminById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(admin).where(eq(admin.id, id)).limit(1);

  return result[0] || null;
}

export async function getAdminByAccountId(env: Env, accountId: number) {
  const db = getDb(env);
  const result = await db.select().from(admin).where(eq(admin.accountId, accountId)).limit(1);

  return result[0] || null;
}

export async function createAdmin(env: Env, values: typeof admin.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(admin).values(values).returning();

  return result[0];
}
