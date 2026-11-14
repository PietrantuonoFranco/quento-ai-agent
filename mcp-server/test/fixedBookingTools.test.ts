import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/bookerQueries");
vi.mock("../src/db/queries/fixedBookingQueries");

import * as bookerQueries from "../src/db/queries/bookerQueries";
import * as fixedBookingQueries from "../src/db/queries/fixedBookingQueries";
import { getFixedBookingTools } from "../src/tools/fixedBookingTools";
import { NOW_UTC, TODAY, at, callTool, env } from "./helpers";

const tools = getFixedBookingTools(env);
const call = (name: string, args: Record<string, unknown> = {}) => callTool(tools, name, args);
const q = vi.mocked;

// Turno fijo 4 del booker 5: los martes a las 19:30 en la cancha 2, cada semana.
const fixedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  bookerId: 5,
  courtId: 2,
  courtNumber: 2,
  startDate: "2026-09-01",
  endDate: null,
  startTime: "19:30:00",
  durationMinutes: 90,
  frequency: "weekly",
  isActive: true,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW_UTC));

  q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Player" } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("get_my_fixed_bookings", () => {
  it("lista los turnos fijos activos del teléfono con su día y hora", async () => {
    q(fixedBookingQueries.getActiveFixedBookingsByBookerId).mockResolvedValue([fixedRow()] as any);

    const result = await call("get_my_fixed_bookings", { phoneNumber: "5491111" });

    expect(fixedBookingQueries.getActiveFixedBookingsByBookerId).toHaveBeenCalledWith(env, 5);
    expect(result).toEqual([
      {
        fixedBookingId: 4,
        courtId: 2,
        courtNumber: 2,
        dayOfWeek: "tuesday",
        startTime: "19:30",
        durationMinutes: 90,
        frequency: "weekly",
        startDate: "2026-09-01",
        endDate: null,
      },
    ]);
  });

  it("devuelve una lista vacía si el teléfono no está registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    expect(await call("get_my_fixed_bookings", { phoneNumber: "5491111" })).toEqual([]);
    expect(fixedBookingQueries.getActiveFixedBookingsByBookerId).not.toHaveBeenCalled();
  });
});

describe("cancel_fixed_booking", () => {
  const input = { fixedBookingId: 4, phoneNumber: "5491111" };

  beforeEach(() => {
    q(fixedBookingQueries.getFixedBookingById).mockResolvedValue(fixedRow() as any);
    q(fixedBookingQueries.cancelFixedBooking).mockResolvedValue(3);
  });

  it("da de baja el turno fijo y cancela sus fechas futuras", async () => {
    const result = await call("cancel_fixed_booking", input);

    expect(fixedBookingQueries.cancelFixedBooking).toHaveBeenCalledWith(env, 4, at(TODAY, "09:00"));
    expect(result).toEqual({ fixedBookingId: 4, cancelledDates: 3 });
  });

  it("usa el mismo error si no existe, es de otra persona o el teléfono no está registrado", async () => {
    q(fixedBookingQueries.getFixedBookingById).mockResolvedValueOnce(null as any);
    const missing = await call("cancel_fixed_booking", input).catch((e) => e.message);

    q(fixedBookingQueries.getFixedBookingById).mockResolvedValueOnce(fixedRow({ bookerId: 99 }) as any);
    const foreign = await call("cancel_fixed_booking", input).catch((e) => e.message);

    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValueOnce(null as any);
    const unregistered = await call("cancel_fixed_booking", input).catch((e) => e.message);

    expect(missing).toBe("Fixed booking not found for this phone number");
    expect(foreign).toBe(missing);
    expect(unregistered).toBe(missing);
    expect(fixedBookingQueries.cancelFixedBooking).not.toHaveBeenCalled();
  });

  it("falla si ya estaba dado de baja", async () => {
    q(fixedBookingQueries.getFixedBookingById).mockResolvedValue(fixedRow({ isActive: false }) as any);

    await expect(call("cancel_fixed_booking", input)).rejects.toThrow("already cancelled");
    expect(fixedBookingQueries.cancelFixedBooking).not.toHaveBeenCalled();
  });

  it("exige un id positivo", async () => {
    await expect(call("cancel_fixed_booking", { fixedBookingId: 0, phoneNumber: "5491111" })).rejects.toThrow();
  });
});
