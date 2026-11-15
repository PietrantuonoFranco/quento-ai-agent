import { pgTable, serial, integer, doublePrecision, varchar, timestamp } from "drizzle-orm/pg-core";

import { booker } from "./bookerSchema";
import { booking } from "./bookingSchema";


// Movimientos de puntos de un jugador (negativos = penalizaciones). La suma de
// penalized_scoring es su saldo, que la web también guarda en bookers.scoring.
export const penalty = pgTable("penalties", {
  id: serial("id").primaryKey(),

  playerId: integer("player_id").references(() => booker.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => booking.id, { onDelete: "set null" }),

  penalizedScoring: doublePrecision("penalized_scoring").notNull(),
  reason: varchar("reason").notNull(),
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
});
