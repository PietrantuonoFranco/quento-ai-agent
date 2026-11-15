import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();


// La BD la crea y migra la web (padel-quento, TypeORM); los schemas de Drizzle
// son solo un espejo parcial. No usar `drizzle-kit push`/`migrate`: borrarían
// las tablas que el bot no declara. tablesFilter limita drizzle-kit (studio,
// pull) a las tablas del bot.
export default defineConfig({
  schema: "./src/db/schemas/index.ts",
  dialect: "postgresql",
  tablesFilter: [
    "bookers",
    "bookings",
    "complexes",
    "courts",
    "fixed_bookings",
    "fixed_booking_dates",
    "inscriptions",
    "lessons",
    "lesson_schedules",
    "matches",
    "match_players",
    "out_of_services",
    "penalties",
    "schedules",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false }
  },
  verbose: true,
  strict: true,
});