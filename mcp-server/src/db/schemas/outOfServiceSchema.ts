import { pgTable, pgEnum, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

import { court } from "./courtSchema";
import OutOfServiceReason from "../../lib/enums/outOfServiceReason";


export const outOfServiceReasonEnum = pgEnum("out_of_services_reason_enum", OutOfServiceReason);

export const outOfService = pgTable("out_of_services", {
  id: serial("id").primaryKey(),

  courtId: integer("court_id").references(() => court.id),
  reason: outOfServiceReasonEnum("reason").notNull(),
  description: varchar("description", { length: 255 }),
  fromDatetime: timestamp("from_datetime", { mode: 'date' }).notNull(),
  toDatetime: timestamp("to_datetime", { mode: 'date' }).notNull(),
});
