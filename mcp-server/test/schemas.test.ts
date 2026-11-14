import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  booking,
  bookingStateEnum,
  courtStateEnum,
  fixedBooking,
  fixedBookingDate,
  fixedBookingDateStateEnum,
  fixedBookingFrequencyEnum,
  inscription,
  lesson,
  lessonSchedule,
  lessonScheduleDayOfWeekEnum,
  matchPlayer,
  penalty,
} from "../src/db/schemas";

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

describe("schema de penalties", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(penalty)).toEqual(
      ["id", "player_id", "booking_id", "penalized_scoring", "reason", "created_at"].sort(),
    );
  });
});

describe("schema de fixed_bookings", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(fixedBooking)).toEqual(
      [
        "id",
        "court_id",
        "booker_id",
        "start_date",
        "end_date",
        "start_time",
        "duration_minutes",
        "frequency",
        "is_active",
        "created_at",
      ].sort(),
    );
  });

  it("usa las frecuencias weekly y biweekly", () => {
    expect(getTableConfig(fixedBooking).columns.find((c) => c.name === "frequency")).toBeDefined();
    expect(fixedBookingFrequencyEnum.enumName).toBe("fixed_bookings_frequency_enum");
    expect(fixedBookingFrequencyEnum.enumValues).toEqual(["weekly", "biweekly"]);
  });
});

describe("schema de fixed_booking_dates", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(fixedBookingDate)).toEqual(["id", "fixed_booking_id", "date", "state", "booking_id"].sort());
  });

  it("usa los estados booked, released y conflict", () => {
    expect(fixedBookingDateStateEnum.enumName).toBe("fixed_booking_dates_state_enum");
    expect(fixedBookingDateStateEnum.enumValues).toEqual(["booked", "released", "conflict"]);
  });
});

describe("schema de lessons", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(lesson)).toEqual(
      [
        "id",
        "teacher_id",
        "class_capacity",
        "is_active",
        "created_at",
        "from_local_datetime",
        "to_local_datetime",
        "price",
      ].sort(),
    );
  });

  it("bookings.lesson_id referencia a lessons", () => {
    const foreignKey = getTableConfig(booking).foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === "lesson_id"),
    );

    expect(foreignKey).toBeDefined();
    expect(getTableConfig(foreignKey!.reference().foreignTable).name).toBe("lessons");
  });
});

describe("schema de lesson_schedules", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(lessonSchedule)).toEqual(
      ["id", "lesson_id", "court_id", "day_of_week", "start_time", "end_time"].sort(),
    );
  });

  it("usa su propio enum de días", () => {
    expect(lessonScheduleDayOfWeekEnum.enumName).toBe("lesson_schedules_day_of_week_enum");
  });
});

describe("schema de inscriptions", () => {
  it("tiene las columnas actuales de la web", () => {
    expect(columnsOf(inscription)).toEqual(["id", "lesson_id", "player_id", "created_at"].sort());
  });
});

