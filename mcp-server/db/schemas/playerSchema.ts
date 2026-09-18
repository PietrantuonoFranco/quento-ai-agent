import { pgTable, serial, integer, varchar, real, timestamp } from "drizzle-orm/pg-core";

import { account } from "./accountSchema";
import { booker } from "./bookerSchema";


export const player = pgTable("players", {
  id: serial("id").primaryKey(),

  accountId: integer("account_id").notNull().references(() => account.id),
  bookerId: integer("booker_id").references(() => booker.id),
  dni: integer("dni").notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  scoring: real("scoring").notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
