import { pgTable, serial, varchar, numeric } from "drizzle-orm/pg-core";

export const complex = pgTable("complexes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  province: varchar("province", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 10 }).notNull(),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  mapsUrl: varchar("maps_url", { length: 500 }),
  whatsappNumber: varchar("whatsapp_number", { length: 30 }),
  whatsappMessage: varchar("whatsapp_message", { length: 500 }),
});
