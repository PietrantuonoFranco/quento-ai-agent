import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/bookingQueries");
vi.mock("../src/db/queries/outOfServiceQueries");
vi.mock("../src/db/queries/matchQueries");
vi.mock("../src/db/queries/bookerQueries");
vi.mock("../src/db/queries/courtQueries");
vi.mock("../src/db/queries/scheduleQueries");

import * as bookingQueries from "../src/db/queries/bookingQueries";
import * as outOfServiceQueries from "../src/db/queries/outOfServiceQueries";
import * as matchQueries from "../src/db/queries/matchQueries";
import * as bookerQueries from "../src/db/queries/bookerQueries";
import * as courtQueries from "../src/db/queries/courtQueries";
import * as scheduleQueries from "../src/db/queries/scheduleQueries";
import { getBookingTools } from "../src/tools/bookingTools";
import { NOW_UTC, TODAY, TOMORROW, at, bookingRow, callTool, env, schedule } from "./helpers";

const tools = getBookingTools(env);
const call = (name: string, args: Record<string, unknown> = {}) => callTool(tools, name, args);

const court1 = { id: 1, number: 1, state: "available" };
const court2 = { id: 2, number: 2, state: "available" };

// Grilla de 90' con apertura 09:00 y cierre 23:00 (el último turno que entra arranca 21:00).
const FULL_GRID = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"];

const q = vi.mocked;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW_UTC));

  q(courtQueries.getAllCourts).mockResolvedValue([court1, court2] as any);
  q(courtQueries.getCourtById).mockResolvedValue(court1 as any);
  q(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1), schedule(2)] as any);
  q(scheduleQueries.getScheduleByCourtIdAndDay).mockResolvedValue(schedule(1) as any);
  q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([]);
  q(outOfServiceQueries.getOutOfServicesInRange).mockResolvedValue([]);
  q(courtQueries.checkCourtAvailability).mockResolvedValue(0);
  q(matchQueries.getMatchByBookingId).mockResolvedValue(null as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

const slotsOf = (result: any[], courtId: number) =>
  result.find((c) => c.courtId === courtId)?.slots.map((s: string) => s.slice(11, 16));

describe("get_available_bookings", () => {
  it("devuelve la grilla completa de cada cancha cuando no hay nada ocupado", async () => {
    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(result).toHaveLength(2);
    expect(slotsOf(result, 1)).toEqual(FULL_GRID);
    expect(slotsOf(result, 2)).toEqual(FULL_GRID);
    expect(result[0]).toMatchObject({ courtId: 1, courtNumber: 1 });
    expect(result[0].slots[0]).toBe(`${TOMORROW}T09:00:00.000Z`);
  });

  it("usa una cantidad fija de queries de disponibilidad", async () => {
    await call("get_available_bookings", { date: TOMORROW });

    expect(courtQueries.getAllCourts).toHaveBeenCalledTimes(1);
    expect(scheduleQueries.getSchedulesByDay).toHaveBeenCalledTimes(1);
    expect(bookingQueries.getActiveBookingsInRange).toHaveBeenCalledTimes(1);
    expect(outOfServiceQueries.getOutOfServicesInRange).toHaveBeenCalledTimes(1);
  });

  it("consulta el día de la semana correspondiente a la fecha", async () => {
    await call("get_available_bookings", { date: TOMORROW }); // domingo

    expect(scheduleQueries.getSchedulesByDay).toHaveBeenCalledWith(env, "sunday", undefined);
  });

  it("solo considera canchas en estado available cuando no se pide una cancha", async () => {
    await call("get_available_bookings", { date: TOMORROW });

    expect(courtQueries.getAllCourts).toHaveBeenCalledWith(env, "available");
  });

  it("descuenta una reserva solo en su cancha", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ courtId: 1, datetime: at(TOMORROW, "10:30") }),
    ] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(slotsOf(result, 1)).not.toContain("10:30");
    expect(slotsOf(result, 1)).toHaveLength(FULL_GRID.length - 1);
    expect(slotsOf(result, 2)).toContain("10:30");
  });

  it("descuenta todos los turnos que se solapan con una reserva desalineada", async () => {
    // 11:00-12:30 pisa los turnos 10:30-12:00 y 12:00-13:30
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ courtId: 1, datetime: at(TOMORROW, "11:00") }),
    ] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(slotsOf(result, 1)).not.toContain("10:30");
    expect(slotsOf(result, 1)).not.toContain("12:00");
    expect(slotsOf(result, 1)).toContain("09:00");
    expect(slotsOf(result, 1)).toContain("13:30");
  });

  it("un turno que termina justo cuando arranca la reserva no se solapa", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ courtId: 1, datetime: at(TOMORROW, "12:00") }),
    ] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(slotsOf(result, 1)).toContain("10:30"); // 10:30-12:00
    expect(slotsOf(result, 1)).toContain("13:30"); // 13:30-15:00
    expect(slotsOf(result, 1)).not.toContain("12:00");
  });

  it("descuenta los períodos fuera de servicio", async () => {
    q(outOfServiceQueries.getOutOfServicesInRange).mockResolvedValue([
      { courtId: 2, fromDatetime: at(TOMORROW, "09:00"), toDatetime: at(TOMORROW, "12:00") },
    ] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(slotsOf(result, 2)[0]).toBe("12:00");
    expect(slotsOf(result, 1)).toEqual(FULL_GRID);
  });

  it("omite las canchas sin turnos libres", async () => {
    q(outOfServiceQueries.getOutOfServicesInRange).mockResolvedValue([
      { courtId: 2, fromDatetime: at(TOMORROW, "00:00"), toDatetime: at(TOMORROW, "23:59") },
    ] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(result.map((c: any) => c.courtId)).toEqual([1]);
  });

  it("trata como cerrada a la cancha sin horario cargado ese día", async () => {
    q(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1)] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    expect(result.map((c: any) => c.courtId)).toEqual([1]);
  });

  it("respeta el horario de apertura y cierre de la cancha", async () => {
    q(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1, "10:00:00", "14:00:00"), schedule(2)] as any);

    const result = await call("get_available_bookings", { date: TOMORROW });

    // 10:00-11:30 y 11:30-13:00; 13:00-14:30 ya no entra
    expect(slotsOf(result, 1)).toEqual(["10:00", "11:30"]);
  });

  it("no ofrece turnos que ya empezaron el día de hoy", async () => {
    vi.setSystemTime(new Date("2026-09-19T15:00:00Z")); // 12:00 en Buenos Aires

    const result = await call("get_available_bookings", { date: TODAY });

    expect(slotsOf(result, 1)).toEqual(["13:30", "15:00", "16:30", "18:00", "19:30", "21:00"]);
  });

  it("si se omite la fecha usa hoy en la zona del club", async () => {
    vi.setSystemTime(new Date("2026-09-20T01:00:00Z")); // 22:00 del 19 en Buenos Aires

    const result = await call("get_available_bookings");

    expect(scheduleQueries.getSchedulesByDay).toHaveBeenCalledWith(env, "saturday", undefined);
    expect(result).toEqual([]); // el único turno posible (21:00) ya empezó
  });

  it("devuelve vacío para una fecha pasada", async () => {
    expect(await call("get_available_bookings", { date: "2026-09-01" })).toEqual([]);
  });

  it("con courtId consulta solo esa cancha", async () => {
    q(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1)] as any);

    const result = await call("get_available_bookings", { date: TOMORROW, courtId: 1 });

    expect(courtQueries.getCourtById).toHaveBeenCalledWith(env, 1);
    expect(courtQueries.getAllCourts).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(scheduleQueries.getSchedulesByDay).toHaveBeenCalledWith(env, "sunday", 1);
  });

  it("devuelve vacío si la cancha pedida no existe", async () => {
    q(courtQueries.getCourtById).mockResolvedValue(null as any);

    expect(await call("get_available_bookings", { date: TOMORROW, courtId: 99 })).toEqual([]);
    expect(scheduleQueries.getSchedulesByDay).not.toHaveBeenCalled();
  });

  it("devuelve vacío si no hay canchas disponibles", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([]);

    expect(await call("get_available_bookings", { date: TOMORROW })).toEqual([]);
  });

  it("rechaza una fecha con formato inválido", async () => {
    await expect(call("get_available_bookings", { date: "mañana" })).rejects.toThrow();
  });
});

describe("get_available_times", () => {
  it("devuelve cada horario una sola vez aunque haya varias canchas libres", async () => {
    const result = await call("get_available_times", { date: TOMORROW });

    expect(result).toEqual({ date: TOMORROW, durationMinutes: 90, times: FULL_GRID });
  });

  it("un horario sigue apareciendo si al menos una cancha lo tiene libre", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ courtId: 1, datetime: at(TOMORROW, "13:30") }),
    ] as any);

    const { times } = await call("get_available_times", { date: TOMORROW });

    expect(times).toContain("13:30");
  });

  it("un horario desaparece si todas las canchas lo tienen ocupado", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ id: 1, courtId: 1, datetime: at(TOMORROW, "13:30") }),
      bookingRow({ id: 2, courtId: 2, datetime: at(TOMORROW, "13:30") }),
    ] as any);

    const { times } = await call("get_available_times", { date: TOMORROW });

    expect(times).not.toContain("13:30");
    expect(times).toHaveLength(FULL_GRID.length - 1);
  });

  it("los horarios vienen ordenados aunque las canchas abran a distinta hora", async () => {
    q(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1, "10:00:00"), schedule(2, "09:00:00")] as any);

    const { times } = await call("get_available_times", { date: TOMORROW });

    expect(times).toEqual([...times].sort());
    expect(times.slice(0, 3)).toEqual(["09:00", "10:00", "10:30"]);
  });

  it("usa hoy si se omite la fecha y filtra los turnos ya empezados", async () => {
    vi.setSystemTime(new Date("2026-09-19T21:00:00Z")); // 18:00 en Buenos Aires

    const result = await call("get_available_times");

    expect(result.date).toBe(TODAY);
    expect(result.times).toEqual(["19:30", "21:00"]);
  });

  it("devuelve una lista vacía si no hay nada libre", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([]);

    expect((await call("get_available_times", { date: TOMORROW })).times).toEqual([]);
  });
});

describe("check_time_availability", () => {
  it("indica las canchas libres cuando el horario está disponible", async () => {
    const result = await call("check_time_availability", { date: TOMORROW, time: "13:30" });

    expect(result).toEqual({
      date: TOMORROW,
      time: "13:30",
      available: true,
      courts: [
        { courtId: 1, courtNumber: 1 },
        { courtId: 2, courtNumber: 2 },
      ],
    });
  });

  it("solo lista las canchas que siguen libres a esa hora", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ courtId: 1, datetime: at(TOMORROW, "13:30") }),
    ] as any);

    const result = await call("check_time_availability", { date: TOMORROW, time: "13:30" });

    expect(result.available).toBe(true);
    expect(result.courts).toEqual([{ courtId: 2, courtNumber: 2 }]);
  });

  it("si está ocupado devuelve available=false y los horarios alternativos", async () => {
    q(bookingQueries.getActiveBookingsInRange).mockResolvedValue([
      bookingRow({ id: 1, courtId: 1, datetime: at(TOMORROW, "13:30") }),
      bookingRow({ id: 2, courtId: 2, datetime: at(TOMORROW, "13:30") }),
    ] as any);

    const result = await call("check_time_availability", { date: TOMORROW, time: "13:30" });

    expect(result.available).toBe(false);
    expect(result.courts).toEqual([]);
    expect(result.availableTimes).toEqual(FULL_GRID.filter((t) => t !== "13:30"));
  });

  it("un horario fuera de la grilla no está disponible", async () => {
    const result = await call("check_time_availability", { date: TOMORROW, time: "13:00" });

    expect(result.available).toBe(false);
    expect(result.availableTimes).toEqual(FULL_GRID);
  });

  it("un horario que ya empezó hoy no está disponible", async () => {
    vi.setSystemTime(new Date("2026-09-19T15:00:00Z")); // 12:00 en Buenos Aires

    const result = await call("check_time_availability", { time: "10:30" });

    expect(result.date).toBe(TODAY);
    expect(result.available).toBe(false);
    expect(result.availableTimes[0]).toBe("13:30");
  });

  it("rechaza un horario con formato inválido", async () => {
    await expect(call("check_time_availability", { time: "25:00" })).rejects.toThrow();
    await expect(call("check_time_availability", {})).rejects.toThrow();
  });
});

describe("create_booking", () => {
  const input = { courtId: 1, bookerPhoneNumber: "5491111", datetime: `${TOMORROW}T12:00:00Z` };

  beforeEach(() => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, phoneNumber: "5491111" } as any);
    q(bookingQueries.createBooking).mockResolvedValue(bookingRow() as any);
  });

  it("crea la reserva en estado reserved con la duración fija", async () => {
    const result = await call("create_booking", input);

    expect(bookingQueries.createBooking).toHaveBeenCalledWith(env, {
      courtId: 1,
      bookerPhoneNumber: "5491111",
      datetime: at(TOMORROW, "12:00"),
      durationMinutes: 90,
      bookingState: "reserved",
    });
    expect(result).toMatchObject({ id: 1 });
  });

  it("acepta un datetime sin zona horaria como hora de pared del club", async () => {
    await call("create_booking", { ...input, datetime: `${TOMORROW}T12:00:00` });

    expect(bookingQueries.createBooking).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ datetime: at(TOMORROW, "12:00") }),
    );
  });

  it("falla si el booker no está registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    await expect(call("create_booking", input)).rejects.toThrow("not registered");
    expect(bookingQueries.createBooking).not.toHaveBeenCalled();
  });

  it("falla si el datetime no es válido", async () => {
    await expect(call("create_booking", { ...input, datetime: "no-es-fecha" })).rejects.toThrow(
      "not a valid ISO datetime",
    );
  });

  it("rechaza un horario en el pasado", async () => {
    await expect(call("create_booking", { ...input, datetime: `${TODAY}T08:00:00Z` })).rejects.toThrow("in the past");
    expect(bookingQueries.createBooking).not.toHaveBeenCalled();
  });

  it("rechaza un turno que ya empezó (horario igual a ahora)", async () => {
    await expect(call("create_booking", { ...input, datetime: `${TODAY}T09:00:00Z` })).rejects.toThrow("in the past");
  });

  it.each(["12:30", "12:01", "08:00", "22:00"])("rechaza el horario fuera de la grilla %s", async (time) => {
    await expect(call("create_booking", { ...input, datetime: `${TOMORROW}T${time}:00Z` })).rejects.toThrow(
      "fixed booking slots",
    );
    expect(bookingQueries.createBooking).not.toHaveBeenCalled();
  });

  it("rechaza si la cancha no tiene horario ese día", async () => {
    q(scheduleQueries.getScheduleByCourtIdAndDay).mockResolvedValue(null as any);

    await expect(call("create_booking", input)).rejects.toThrow("fixed booking slots");
  });

  it("acepta el último turno que entra antes del cierre", async () => {
    await call("create_booking", { ...input, datetime: `${TOMORROW}T21:00:00Z` });

    expect(bookingQueries.createBooking).toHaveBeenCalled();
  });

  it("falla si la cancha está ocupada en ese horario", async () => {
    q(courtQueries.checkCourtAvailability).mockResolvedValue(1);

    await expect(call("create_booking", input)).rejects.toThrow("not available");
    expect(bookingQueries.createBooking).not.toHaveBeenCalled();
  });
});

describe("get_my_bookings", () => {
  it("lista las reservas futuras con el número de cancha", async () => {
    q(bookingQueries.getUpcomingBookingsByPhone).mockResolvedValue([
      bookingRow({ id: 7, courtId: 2, datetime: at(TOMORROW, "15:00") }),
    ] as any);

    const result = await call("get_my_bookings", { phoneNumber: "5491111" });

    expect(bookingQueries.getUpcomingBookingsByPhone).toHaveBeenCalledWith(env, "5491111", at(TODAY, "09:00"));
    expect(result).toEqual([
      {
        bookingId: 7,
        courtId: 2,
        courtNumber: 2,
        datetime: `${TOMORROW}T15:00:00.000Z`,
        durationMinutes: 90,
        bookingState: "reserved",
      },
    ]);
  });

  it("devuelve una lista vacía si no tiene reservas", async () => {
    q(bookingQueries.getUpcomingBookingsByPhone).mockResolvedValue([]);

    expect(await call("get_my_bookings", { phoneNumber: "5491111" })).toEqual([]);
  });
});

describe("get_booking_details", () => {
  it("devuelve el detalle sin partido", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);

    const result = await call("get_booking_details", { bookingId: 1, phoneNumber: "5491111" });

    expect(result).toMatchObject({ bookingId: 1, courtId: 1, courtNumber: 1, bookingState: "reserved", match: null });
  });

  it("incluye los datos del partido si existe", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(matchQueries.getMatchByBookingId).mockResolvedValue({ id: 9, needPlayers: true } as any);

    const result = await call("get_booking_details", { bookingId: 1, phoneNumber: "5491111" });

    expect(result.match).toEqual({ matchId: 9, needPlayers: true });
  });

  it("usa el mismo error si la reserva no existe o es de otra persona", async () => {
    q(bookingQueries.getBookingById).mockResolvedValueOnce(null as any);
    const missing = await call("get_booking_details", { bookingId: 1, phoneNumber: "5491111" }).catch((e) => e.message);

    q(bookingQueries.getBookingById).mockResolvedValueOnce(bookingRow({ bookerPhoneNumber: "otro" }) as any);
    const foreign = await call("get_booking_details", { bookingId: 1, phoneNumber: "5491111" }).catch((e) => e.message);

    expect(missing).toBe("Booking not found for this phone number");
    expect(foreign).toBe(missing);
  });
});

describe("cancel_booking", () => {
  it("cancela una reserva futura de su dueño", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(bookingQueries.cancelBooking).mockResolvedValue({ bookingState: "cancelled" } as any);

    const result = await call("cancel_booking", { bookingId: 1, phoneNumber: "5491111" });

    expect(bookingQueries.cancelBooking).toHaveBeenCalledWith(env, 1);
    expect(result).toEqual({ bookingId: 1, bookingState: "cancelled", datetime: `${TOMORROW}T12:00:00.000Z` });
  });

  it("no deja cancelar la reserva de otra persona", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookerPhoneNumber: "otro" }) as any);

    await expect(call("cancel_booking", { bookingId: 1, phoneNumber: "5491111" })).rejects.toThrow("not found");
    expect(bookingQueries.cancelBooking).not.toHaveBeenCalled();
  });

  it("falla si la reserva no existe", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(null as any);

    await expect(call("cancel_booking", { bookingId: 1, phoneNumber: "5491111" })).rejects.toThrow("not found");
  });

  it("falla si ya estaba cancelada", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookingState: "cancelled" }) as any);

    await expect(call("cancel_booking", { bookingId: 1, phoneNumber: "5491111" })).rejects.toThrow(
      "already cancelled",
    );
    expect(bookingQueries.cancelBooking).not.toHaveBeenCalled();
  });

  it("falla si el turno ya empezó o pasó", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ datetime: at(TODAY, "08:00") }) as any);

    await expect(call("cancel_booking", { bookingId: 1, phoneNumber: "5491111" })).rejects.toThrow(
      "already started or passed",
    );
    expect(bookingQueries.cancelBooking).not.toHaveBeenCalled();
  });
});

describe("reschedule_booking", () => {
  const input = { bookingId: 1, phoneNumber: "5491111", newDatetime: `${TOMORROW}T15:00:00Z` };

  beforeEach(() => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(bookingQueries.rescheduleBooking).mockResolvedValue({ datetime: at(TOMORROW, "15:00") } as any);
  });

  it("mueve la reserva a otro horario de la misma cancha", async () => {
    const result = await call("reschedule_booking", input);

    expect(bookingQueries.rescheduleBooking).toHaveBeenCalledWith(env, 1, 1, at(TOMORROW, "15:00"));
    expect(result).toEqual({ bookingId: 1, courtId: 1, datetime: `${TOMORROW}T15:00:00.000Z`, durationMinutes: 90 });
  });

  it("puede cambiar de cancha", async () => {
    q(scheduleQueries.getScheduleByCourtIdAndDay).mockResolvedValue(schedule(2) as any);

    const result = await call("reschedule_booking", { ...input, courtId: 2 });

    expect(scheduleQueries.getScheduleByCourtIdAndDay).toHaveBeenCalledWith(env, 2, "sunday");
    expect(bookingQueries.rescheduleBooking).toHaveBeenCalledWith(env, 1, 2, at(TOMORROW, "15:00"));
    expect(result.courtId).toBe(2);
  });

  it("excluye a la propia reserva al chequear conflictos", async () => {
    await call("reschedule_booking", input);

    expect(courtQueries.checkCourtAvailability).toHaveBeenCalledWith(env, 1, at(TOMORROW, "15:00"), 90, 1);
  });

  it("falla si el nuevo turno está ocupado", async () => {
    q(courtQueries.checkCourtAvailability).mockResolvedValue(1);

    await expect(call("reschedule_booking", input)).rejects.toThrow("not available");
    expect(bookingQueries.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("falla si el nuevo horario no está en la grilla", async () => {
    await expect(call("reschedule_booking", { ...input, newDatetime: `${TOMORROW}T15:10:00Z` })).rejects.toThrow(
      "fixed booking slots",
    );
  });

  it("falla si el nuevo horario está en el pasado", async () => {
    await expect(call("reschedule_booking", { ...input, newDatetime: `${TODAY}T08:00:00Z` })).rejects.toThrow(
      "in the past",
    );
  });

  it("falla si el datetime es inválido", async () => {
    await expect(call("reschedule_booking", { ...input, newDatetime: "xx" })).rejects.toThrow(
      "not a valid ISO datetime",
    );
  });

  it("solo su dueño puede mover la reserva", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookerPhoneNumber: "otro" }) as any);

    await expect(call("reschedule_booking", input)).rejects.toThrow("not found");
    expect(bookingQueries.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("no se puede mover una reserva cancelada ni una que ya empezó", async () => {
    q(bookingQueries.getBookingById).mockResolvedValueOnce(bookingRow({ bookingState: "cancelled" }) as any);
    await expect(call("reschedule_booking", input)).rejects.toThrow("already cancelled");

    q(bookingQueries.getBookingById).mockResolvedValueOnce(bookingRow({ datetime: at(TODAY, "09:00") }) as any);
    await expect(call("reschedule_booking", input)).rejects.toThrow("already started or passed");
  });
});
