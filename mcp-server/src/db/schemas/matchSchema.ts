import { pgTable, serial, integer, boolean } from "drizzle-orm/pg-core";

import { booking } from "./bookingSchema";


export const match = pgTable("matches", {
  id: serial("id").primaryKey(),

  bookingId: integer("booking_id").references(() => booking.id).unique("UQ_matches_booking_id"),
  needPlayers: boolean("need_players").notNull().default(true),
});
