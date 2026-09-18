import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

import { player } from "./playerSchema";


export const penalty = pgTable("penalties", {
  id: serial("id").primaryKey(),

  playerId: integer("player_id").notNull().references(() => player.id),
  penalizedScoring: integer("penalized_scoring").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
