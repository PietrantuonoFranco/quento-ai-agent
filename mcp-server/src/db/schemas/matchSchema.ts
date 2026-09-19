import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

import { booking } from "./bookingSchema";


export const match = pgTable("matchs", {
  id: serial("id").primaryKey(),

  bookingId: integer("booking_id").notNull().references(() => booking.id),
  needPlayers: boolean("need_players").notNull().default(false),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
