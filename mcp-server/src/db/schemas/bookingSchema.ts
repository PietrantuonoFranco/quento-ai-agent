import { pgTable, pgEnum, serial, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import { booker } from "./bookerSchema";
import BookingState from "../../lib/enums/bookingState";


export const bookingStateEnum = pgEnum("bookings_booking_state_enum", BookingState);

// La asistencia y los puntos ya no viven acá: la web los registra en penalties
// (un movimiento por turno) y en match_players.
export const booking = pgTable("bookings", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  bookerId: integer("booker_id").references(() => booker.id),
  // Clase a la que pertenece el turno (lo reservó el profesor); null en cualquier otro turno.
  // La FK a lessons no se declara porque el bot todavía no usa esa tabla.
  lessonId: integer("lesson_id"),

  bookingState: bookingStateEnum("booking_state").notNull(),
  datetime: timestamp("datetime", { mode: 'date' }).notNull(),
  durationMinutes: integer("duration_minutes").default(90).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").default(false).notNull(),
});
