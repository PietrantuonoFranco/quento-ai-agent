import { pgTable, serial, varchar, boolean, timestamp } from "drizzle-orm/pg-core";


export const account = pgTable("accounts", {
  id: serial("id").primaryKey(),

  email: varchar("email", { length: 150 }).notNull().unique(),
  photoUrl: varchar("photo_url", { length: 255 }),
  passwordHashed: varchar("password_hashed", { length: 255 }).notNull(),
  isBlock: boolean("is_block").notNull().default(false),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow().notNull(),
});
