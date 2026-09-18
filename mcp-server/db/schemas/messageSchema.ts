import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

import { chatRoom } from "./chatRoomSchema";
import { player } from "./playerSchema";


export const message = pgTable("messages", {
  id: serial("id").primaryKey(),

  chatRoomId: integer("chat_room_id").notNull().references(() => chatRoom.id),
  playerId: integer("player_id").notNull().references(() => player.id),
  text: text("text").notNull(),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
});
