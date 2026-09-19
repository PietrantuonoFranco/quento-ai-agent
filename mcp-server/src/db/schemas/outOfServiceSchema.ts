import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";


export const outOfService = pgTable("out_of_services", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").notNull().references(() => court.id),
  reason: varchar("reason", { length: 50 }).notNull(),
  description: varchar("description", { length: 255 }),
  fromDatetime: timestamp("from_datetime", { mode: 'date' }).notNull(),
  toDatetime: timestamp("to_datetime", { mode: 'date' }).notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
