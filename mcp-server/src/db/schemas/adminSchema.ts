import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

import { account } from "./accountSchema";


export const admin = pgTable("admins", {
  id: serial("id").primaryKey(),

  accountId: integer("account_id").notNull().references(() => account.id),
  dni: integer("dni").notNull(),
  names: varchar("names", { length: 100 }).notNull(),
  lastNames: varchar("last_names", { length: 100 }).notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
