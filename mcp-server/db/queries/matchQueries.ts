import { getDb } from "../database";
import { booking, match, matchPlayer, player } from "../schemas";
import { and, eq, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import BookingState from "../../lib/enums/bookingState";

export async function getMatchById(env: Env, id: number) {
  const db = getDb(env);
  const result = await db.select().from(match).where(eq(match.id, id)).limit(1);

  return result[0] || null;
}

export async function getMatchByBookingId(env: Env, bookingId: number) {
  const db = getDb(env);
  const result = await db.select().from(match).where(eq(match.bookingId, bookingId)).limit(1);

  return result[0] || null;
}

export async function createMatch(env: Env, values: typeof match.$inferInsert) {
  const db = getDb(env);
  const result = await db.insert(match).values(values).returning();

  return result[0];
}

export async function getOpenMatches(
  env: Env,
  filters: { date?: string; courtId?: number; category?: string } = {},
) {
  const db = getDb(env);

  const conditions = [eq(match.needPlayers, true)];

  if (filters.courtId !== undefined) conditions.push(eq(booking.courtId, filters.courtId));
  if (filters.date !== undefined) conditions.push(sql`${booking.datetime}::date = ${filters.date}::date`);
  if (filters.category !== undefined) conditions.push(eq(player.category, filters.category));

  return db
    .selectDistinct({
      id: match.id,
      bookingId: match.bookingId,
      needPlayers: match.needPlayers,
      courtId: booking.courtId,
      datetime: booking.datetime,
      durationMinutes: booking.durationMinutes,
    })
    .from(match)
    .innerJoin(booking, eq(match.bookingId, booking.id))
    .leftJoin(matchPlayer, eq(matchPlayer.matchId, match.id))
    .leftJoin(player, eq(player.id, matchPlayer.playerId))
    .where(and(...conditions));
}

export async function addPlayerToMatch(env: Env, matchId: number, playerId: number) {
  const db = getDb(env);
  const result = await db.insert(matchPlayer).values({ matchId, playerId }).returning();

  return result[0];
}

export async function matchNeedsPlayers(env: Env, matchId: number) {
  const db = getDb(env);
  const result = await db
    .select({ needPlayers: match.needPlayers })
    .from(match)
    .where(eq(match.id, matchId))
    .limit(1);

  return result[0]?.needPlayers ?? false;
}

// Cierra el partido (deja de buscar jugadores) y devuelve la cantidad de jugadores anotados.
export async function closeMatch(env: Env, matchId: number) {
  const db = getDb(env);
  const players = await db.select().from(matchPlayer).where(eq(matchPlayer.matchId, matchId));

  await db.update(match).set({ needPlayers: false, updatedAt: new Date() }).where(eq(match.id, matchId));

  return players.length;
}

// No hay un sistema de notificaciones persistido; devuelve la cantidad de jugadores que se notificarían.
export async function notifyMatchPlayers(env: Env, matchId: number) {
  const db = getDb(env);
  const players = await db.select().from(matchPlayer).where(eq(matchPlayer.matchId, matchId));

  return players.length;
}

export async function cancelMatch(env: Env, matchId: number) {
  const db = getDb(env);
  const matchRow = await db.select().from(match).where(eq(match.id, matchId)).limit(1);
  const found = matchRow[0];

  if (!found) return null;

  const result = await db
    .update(booking)
    .set({ bookingState: BookingState.CANCELLED, updatedAt: new Date() })
    .where(eq(booking.id, found.bookingId))
    .returning();

  return result[0] || null;
}
