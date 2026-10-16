import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

import { match } from "./matchSchema";
import { booker } from "./bookerSchema";


// player_id apunta a bookers (un Player es un booker con type "Player", ver bookerSchema).
export const matchPlayer = pgTable("match_players", {
  id: serial("id").primaryKey(),

  matchId: integer("match_id").references(() => match.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => booker.id, { onDelete: "cascade" }),
  playersCount: integer("players_count").default(1).notNull(),
  attended: boolean("attended").default(true).notNull(),

  joinedAt: timestamp("joined_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  unique("UQ_match_players_match_player").on(table.matchId, table.playerId),
]);
