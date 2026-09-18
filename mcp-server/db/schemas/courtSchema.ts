import { pgTable, serial, varchar, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";


export const court = pgTable("courts", {
  id: serial("id").primaryKey(),

  number: integer("number").notNull(),
  state: varchar("court_state", { length: 50 }).notNull(),
  
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
