import { pgTable, pgEnum, serial, integer, date, unique } from "drizzle-orm/pg-core";

import { booking } from "./bookingSchema";
import { fixedBooking } from "./fixedBookingSchema";


// Cada fecha generada de un turno fijo con su turno en `bookings` (ver fixedBookingSchema).
export const fixedBookingDateState = pgEnum("fixed_booking_dates_state_enum", ["booked", "released", "conflict"]);

export const fixedBookingDate = pgTable("fixed_booking_dates", {
  id: serial("id").primaryKey(),

  fixedBookingId: integer("fixed_booking_id").references(() => fixedBooking.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => booking.id).unique("UQ_fixed_booking_dates_booking_id"),

  date: date("date").notNull(),
  state: fixedBookingDateState("state").notNull(),
}, (table) => [
  unique("UQ_fixed_booking_dates_fixed_booking_id_date").on(table.fixedBookingId, table.date),
]);
