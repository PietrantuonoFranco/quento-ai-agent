import { getDb } from "../database";
import { booker, matchPlayer } from "../schemas";
import { asc, eq } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";

// Jugadores de un partido con lo necesario para avisarles (nombre y teléfono), en el orden en que se sumaron.
export async function getMatchPlayersContacts(env: Env, matchId: number) {
  const db = getDb(env);

  return db
    .select({
      playerId: matchPlayer.playerId,
      names: booker.names,
      lastNames: booker.lastNames,
      phoneNumber: booker.phoneNumber,
    })
    .from(matchPlayer)
    .innerJoin(booker, eq(matchPlayer.playerId, booker.id))
    .where(eq(matchPlayer.matchId, matchId))
    .orderBy(asc(matchPlayer.id));
}
