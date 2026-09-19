import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

import { match } from "./matchSchema";


export const chatRoom = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),

  matchId: integer("match_id").notNull().references(() => match.id),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
