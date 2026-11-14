import { getDb } from "../database";
import { match } from "../schemas";
import { eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

export async function getMatchByBookingId(env: Env, bookingId: number) {
  const db = getDb(env);
  const result = await db.select().from(match).where(eq(match.bookingId, bookingId)).limit(1);

  return result[0] || null;
}
