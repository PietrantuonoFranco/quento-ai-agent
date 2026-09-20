import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nowInClubTime, todayInClubTimezone } from "../src/lib/clubTime";

describe("clubTime", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("todayInClubTimezone usa el día de Buenos Aires, no el de UTC", () => {
    // 01:00Z del 20 = 22:00 del 19 en Buenos Aires
    vi.setSystemTime(new Date("2026-09-20T01:00:00Z"));

    expect(todayInClubTimezone()).toBe("2026-09-19");
  });

  it("todayInClubTimezone devuelve el formato YYYY-MM-DD", () => {
    vi.setSystemTime(new Date("2026-01-05T15:00:00Z"));

    expect(todayInClubTimezone()).toBe("2026-01-05");
  });

  it("nowInClubTime devuelve la hora de pared del club como UTC nominal", () => {
    vi.setSystemTime(new Date("2026-09-19T12:30:00Z"));

    expect(nowInClubTime().toISOString()).toBe("2026-09-19T09:30:00.000Z");
  });

  it("nowInClubTime cruza el día hacia atrás cuando corresponde", () => {
    vi.setSystemTime(new Date("2026-09-20T01:15:00Z"));

    expect(nowInClubTime().toISOString()).toBe("2026-09-19T22:15:00.000Z");
  });
});
