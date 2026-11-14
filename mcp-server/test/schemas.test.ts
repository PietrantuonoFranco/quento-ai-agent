import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { booking, bookingStateEnum, courtStateEnum, matchPlayer } from "../src/db/schemas";

// El esquema lo migra la web (padel-quento, TypeORM). Drizzle lista en cada SELECT
// todas las columnas declaradas, así que una columna que la web ya borró rompe
// cualquier consulta sobre esa tabla: estos tests fijan el espejo contra la web.
function columnsOf(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name).sort();
}

describe("schema de bookings", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(booking)).toEqual(
      [
        "id",
        "court_id",
        "booker_id",
        "booking_state",
        "datetime",
        "duration_minutes",
        "price",
        "is_paid",
        "lesson_id",
      ].sort(),
    );
  });

  it("referencia al booker por id", () => {
    const [foreignKey] = getTableConfig(booking)
      .foreignKeys.filter((fk) => fk.reference().columns.some((column) => column.name === "booker_id"));

    expect(foreignKey).toBeDefined();
    expect(getTableConfig(foreignKey.reference().foreignTable).name).toBe("bookers");
    expect(foreignKey.reference().foreignColumns.map((column) => column.name)).toEqual(["id"]);
  });

  it("usa los estados reserved, finished y cancelled", () => {
    expect(bookingStateEnum.enumValues).toEqual(["reserved", "finished", "cancelled"]);
  });
});

describe("schema de match_players", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(matchPlayer)).toEqual(
      ["id", "match_id", "player_id", "players_count", "attended_count", "points_awarded", "joined_at"].sort(),
    );
  });
});

describe("schema de courts", () => {
  it("usa los estados available y closed_down", () => {
    expect(courtStateEnum.enumValues).toEqual(["available", "closed_down"]);
  });
});
