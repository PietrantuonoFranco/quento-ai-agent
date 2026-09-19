import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../schemas";
import CourtState from "../../lib/enums/courtState";
import DayOfWeek from "../../lib/enums/dayOfWeek";

const COURTS_COUNT = 8;
const OPENING_TIME = "09:00:00";
const CLOSING_TIME = "23:00:00";

// Siembra las canchas y su horario semanal. Es idempotente: si ya hay canchas no toca nada.
async function seed() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL in .env");

  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle(client, { schema });

  const existing = await db.select().from(schema.court).limit(1);

  if (existing.length > 0) {
    console.log("Courts already seeded, nothing to do");
    await client.end();
    return;
  }

  const courts = await db
    .insert(schema.court)
    .values(Array.from({ length: COURTS_COUNT }, (_, i) => ({ number: i + 1, state: CourtState.AVAILABLE })))
    .returning();

  await db.insert(schema.schedule).values(
    courts.flatMap((courtRow) =>
      Object.values(DayOfWeek).map((dayOfWeek) => ({
        courtId: courtRow.id,
        dayOfWeek,
        openingTime: OPENING_TIME,
        closingTime: CLOSING_TIME,
      })),
    ),
  );

  console.log(`Seeded ${courts.length} courts with their weekly schedules`);
  await client.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
