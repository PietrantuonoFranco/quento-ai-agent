import { pgTable, pgEnum, serial, integer, numeric } from "drizzle-orm/pg-core";

import CourtState from "../../lib/enums/courtState";


export const courtStateEnum = pgEnum("courts_state_enum", CourtState);

export const court = pgTable("courts", {
  id: serial("id").primaryKey(),

  number: integer("number").notNull().unique("UQ_74a18c6d202c625dd7d68768cdb"),
  state: courtStateEnum("state").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});
