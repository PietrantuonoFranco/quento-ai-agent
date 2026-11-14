import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

import { match } from "./matchSchema";
import { booker } from "./bookerSchema";


// player_id apunta a bookers (un Player es un booker con type "Player", ver bookerSchema).
export const matchPlayer = pgTable("match_players", {
  id: serial("id").primaryKey(),

  matchId: integer("match_id").references(() => match.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => booker.id, { onDelete: "cascade" }),
  // El jugador que se anota más los acompañantes sin cuenta que trae.
  playersCount: integer("players_count").default(1).notNull(),
  // Cuántos de ese grupo asistieron (lo ajusta el admin desde la web) y los puntos que acreditó el job.
  attendedCount: integer("attended_count").default(1).notNull(),
  pointsAwarded: integer("points_awarded").default(0).notNull(),

  joinedAt: timestamp("joined_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  unique("UQ_match_players_match_player").on(table.matchId, table.playerId),
]);
