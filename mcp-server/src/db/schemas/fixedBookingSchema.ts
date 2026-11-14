import { pgTable, pgEnum, serial, integer, date, time, boolean, timestamp, unique } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import { booker } from "./bookerSchema";
import { booking } from "./bookingSchema";
import FixedBookingFrequency from "../../lib/enums/fixedBookingFrequency";
import FixedBookingDateState from "../../lib/enums/fixedBookingDateState";


export const fixedBookingFrequencyEnum = pgEnum("fixed_bookings_frequency_enum", FixedBookingFrequency);
export const fixedBookingDateStateEnum = pgEnum("fixed_booking_dates_state_enum", FixedBookingDateState);

// Turno fijo: la misma cancha y hora para el mismo titular cada semana o cada dos.
// El día de la semana es el de start_date. Cada fecha se reserva como un turno común
// (ver fixedBookingDate).
export const fixedBooking = pgTable("fixed_bookings", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  bookerId: integer("booker_id").references(() => booker.id),

  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  startTime: time("start_time").notNull(),
  durationMinutes: integer("duration_minutes").default(90).notNull(),
  frequency: fixedBookingFrequencyEnum("frequency").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
});

export const fixedBookingDate = pgTable("fixed_booking_dates", {
  id: serial("id").primaryKey(),

  fixedBookingId: integer("fixed_booking_id").references(() => fixedBooking.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => booking.id).unique("UQ_fixed_booking_dates_booking_id"),

  date: date("date").notNull(),
  state: fixedBookingDateStateEnum("state").notNull(),
}, (table) => [
  unique("UQ_fixed_booking_dates_fixed_booking_id_date").on(table.fixedBookingId, table.date),
]);
