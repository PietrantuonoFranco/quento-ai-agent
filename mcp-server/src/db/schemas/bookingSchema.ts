import { pgTable, pgEnum, serial, varchar, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import { booker } from "./bookerSchema";
import BookingState from "../../lib/enums/bookingState";


export const bookingStateEnum = pgEnum("bookings_booking_state_enum", BookingState);

export const booking = pgTable("bookings", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  bookerPhoneNumber: varchar("booker_phone_number").references(() => booker.phoneNumber, { onUpdate: "cascade" }),

  bookingState: bookingStateEnum("booking_state").notNull(),
  datetime: timestamp("datetime", { mode: 'date' }).notNull(),
  durationMinutes: integer("duration_minutes").default(90).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  attended: boolean("attended").default(true).notNull(),
  pointsAwarded: boolean("points_awarded").default(false).notNull(),
});
