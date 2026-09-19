import { pgTable, serial, integer, varchar, time, timestamp } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";


export const schedule = pgTable("schedules", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").notNull().references(() => court.id),
  dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(),

  openingTime: time("opening_time").notNull(),
  closingTime: time("closing_time").notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
