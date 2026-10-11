import { pgTable, pgEnum, serial, integer, varchar, date, time, boolean, timestamp } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import { booker } from "./bookerSchema";


// Turnos fijos (HU-41 de la web): los gestiona solo la web y sus fechas se reservan
// como turnos comunes en `bookings`, así que el bot no necesita leer esta tabla.
// Se define acá para que Drizzle la conozca y no la borre. Los tipos (incluido
// el enum de Postgres) replican la migración AddFixedBookings de padel-quento.
export const fixedBookingFrequency = pgEnum("fixed_bookings_frequency_enum", ["weekly", "biweekly"]);

export const fixedBooking = pgTable("fixed_bookings", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  bookerPhoneNumber: varchar("booker_phone_number").references(() => booker.phoneNumber, { onUpdate: "cascade" }),

  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  startTime: time("start_time").notNull(),
  durationMinutes: integer("duration_minutes").default(90).notNull(),
  frequency: fixedBookingFrequency("frequency").notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
});
