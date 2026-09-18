import { pgTable, serial, varchar, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { court } from "./courtSchema";
import { booker } from "./bookerSchema";


export const booking = pgTable("bookings", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").notNull().references(() => court.id),
  bookerPhoneNumber: varchar("booker_phone_number", { length: 20 }).notNull().references(() => booker.phoneNumber),

  bookingState: varchar("booking_state", { length: 50 }).notNull(),
  datetime: timestamp("datetime", { mode: 'date' }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
