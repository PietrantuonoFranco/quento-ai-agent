import { pgTable, pgEnum, serial, integer, time } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import DayOfWeek from "../../lib/enums/dayOfWeek";


export const dayOfWeekEnum = pgEnum("schedules_day_of_week_enum", DayOfWeek);

export const schedule = pgTable("schedules", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),

  openingTime: time("opening_time").default("09:00:00").notNull(),
  closingTime: time("closing_time").default("23:00:00").notNull(),
});
