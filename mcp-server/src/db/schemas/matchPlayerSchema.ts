import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";

import { match } from "./matchSchema";
import { player } from "./playerSchema";


export const matchPlayer = pgTable("match_players", {
  matchId: integer("match_id").notNull().references(() => match.id),
  playerId: integer("player_id").notNull().references(() => player.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.matchId, table.playerId] }),
}));
