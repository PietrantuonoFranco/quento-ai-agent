import { pgTable, serial, varchar, integer, doublePrecision, unique } from "drizzle-orm/pg-core";


// Espejo de "bookers" de la web (TypeORM). Booker y Player comparten esta tabla
// (herencia en una única tabla): "type" vale "Booker" o "Player", y account_id,
// category y scoring solo los usa Player. La FK a accounts no se declara porque
// el bot no usa esa tabla.
export const booker = pgTable("bookers", {
  id: serial("id").primaryKey(),

  names: varchar("names").notNull(),
  lastNames: varchar("last_names").notNull(),
  phoneNumber: varchar("phone_number").notNull(),
  type: varchar("type").notNull(),

  accountId: integer("account_id").unique("UQ_bookers_account_id"),
  category: varchar("category").default("without_category"),
  scoring: doublePrecision("scoring").default(0),
}, (table) => [
  unique("UQ_bookers_phone_number").on(table.phoneNumber),
]);
