import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/courtQueries");
vi.mock("../src/db/queries/scheduleQueries");
vi.mock("../src/db/queries/bookerQueries");

import * as courtQueries from "../src/db/queries/courtQueries";
import * as scheduleQueries from "../src/db/queries/scheduleQueries";
import * as bookerQueries from "../src/db/queries/bookerQueries";
import { getClubTools } from "../src/tools/clubTools";
import { getCourtTools } from "../src/tools/courtTools";
import { getBookerTools } from "../src/tools/bookerTools";
import { callTool, env } from "./helpers";

const q = vi.mocked;

afterEach(() => vi.resetAllMocks());

describe("get_club_info", () => {
  const call = () => callTool(getClubTools(env), "get_club_info");

  it("resume canchas por estado, horarios, duración y zona horaria", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([
      { id: 1, state: "available" },
      { id: 2, state: "available" },
      { id: 3, state: "maintenance" },
    ] as any);
    q(scheduleQueries.getAllSchedules).mockResolvedValue([
      { courtId: 1, dayOfWeek: "monday", openingTime: "09:00:00", closingTime: "23:00:00" },
      { courtId: 2, dayOfWeek: "monday", openingTime: "10:00:00", closingTime: "22:00:00" },
    ] as any);

    const result = await call();

    expect(result.totalCourts).toBe(3);
    expect(result.courtsByState).toEqual({ available: 2, maintenance: 1 });
    expect(result.slotDurationMinutes).toBe(90);
    expect(result.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(result.openingHours).toHaveLength(7);
  });

  it("usa el rango más amplio entre canchas y marca cerrados los días sin horario", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([{ id: 1, state: "available" }] as any);
    q(scheduleQueries.getAllSchedules).mockResolvedValue([
      { courtId: 1, dayOfWeek: "monday", openingTime: "10:00:00", closingTime: "22:00:00" },
      { courtId: 2, dayOfWeek: "monday", openingTime: "09:00:00", closingTime: "23:30:00" },
    ] as any);

    const { openingHours } = await call();

    expect(openingHours.find((d: any) => d.dayOfWeek === "monday")).toEqual({
      dayOfWeek: "monday",
      open: true,
      openingTime: "09:00",
      closingTime: "23:30",
    });
    expect(openingHours.find((d: any) => d.dayOfWeek === "tuesday")).toEqual({ dayOfWeek: "tuesday", open: false });
  });

  it("no incluye precios ni política de cancelación", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([]);
    q(scheduleQueries.getAllSchedules).mockResolvedValue([]);

    const result = await call();

    expect(result).not.toHaveProperty("prices");
    expect(result).not.toHaveProperty("cancellationPolicy");
    expect(result.totalCourts).toBe(0);
  });
});

describe("court tools", () => {
  const tools = getCourtTools(env);

  it("get_court_status devuelve una cancha puntual como lista", async () => {
    q(courtQueries.getCourtById).mockResolvedValue({ id: 2 } as any);

    expect(await callTool(tools, "get_court_status", { courtId: 2 })).toEqual([{ id: 2 }]);
  });

  it("get_court_status devuelve lista vacía si la cancha no existe", async () => {
    q(courtQueries.getCourtById).mockResolvedValue(null as any);

    expect(await callTool(tools, "get_court_status", { courtId: 99 })).toEqual([]);
  });

  it("get_court_status sin courtId devuelve todas", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);

    expect(await callTool(tools, "get_court_status")).toHaveLength(2);
    expect(courtQueries.getCourtById).not.toHaveBeenCalled();
  });

  it("list_courts filtra por estado", async () => {
    q(courtQueries.getAllCourts).mockResolvedValue([]);

    await callTool(tools, "list_courts", { state: "maintenance" });

    expect(courtQueries.getAllCourts).toHaveBeenCalledWith(env, "maintenance");
  });

  it("list_courts rechaza un estado inválido", async () => {
    await expect(callTool(tools, "list_courts", { state: "roto" })).rejects.toThrow();
  });

  describe("get_court_location", () => {
    it("devuelve los datos completos de ubicación del complejo por courtId", async () => {
      q(courtQueries.getCourtById).mockResolvedValue({ id: 2, number: 2 } as any);

      const result = await callTool(tools, "get_court_location", { courtId: 2 });

      expect(courtQueries.getCourtById).toHaveBeenCalledWith(env, 2);
      expect(result).toEqual({
        court: { id: 2, number: 2, name: "Cancha 2" },
        clubName: "Quento Club",
        address: "Cam. Centenario 8907, B1894 Villa Elisa, Buenos Aires",
        city: "Villa Elisa",
        coordinates: {
          latitude: -34.8637264,
          longitude: -58.0610566,
        },
        googleMapsUrl: "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA",
      });
    });

    it("encuentra la cancha extrayendo el número desde el nombre (ej. 'Cancha 3')", async () => {
      q(courtQueries.getCourtByNumber).mockResolvedValue({ id: 3, number: 3 } as any);

      const result = await callTool(tools, "get_court_location", { name: "Cancha 3" });

      expect(courtQueries.getCourtByNumber).toHaveBeenCalledWith(env, 3);
      expect(result.court).toEqual({ id: 3, number: 3, name: "Cancha 3" });
      expect(result.clubName).toBe("Quento Club");
      expect(result.googleMapsUrl).toContain("maps");
    });

    it("encuentra la cancha si el nombre es solo el número", async () => {
      q(courtQueries.getCourtByNumber).mockResolvedValue({ id: 1, number: 1 } as any);

      const result = await callTool(tools, "get_court_location", { name: "1" });

      expect(courtQueries.getCourtByNumber).toHaveBeenCalledWith(env, 1);
      expect(result.court).toEqual({ id: 1, number: 1, name: "Cancha 1" });
    });

    it("lanza un error claro si la cancha no existe", async () => {
      q(courtQueries.getCourtById).mockResolvedValue(null as any);

      await expect(callTool(tools, "get_court_location", { courtId: 99 })).rejects.toThrow(
        "Court not found with the provided id or name",
      );
    });

    it("lanza un error si no se pasa ni courtId ni name", async () => {
      await expect(callTool(tools, "get_court_location", {})).rejects.toThrow(
        "Court not found with the provided id or name",
      );
    });
  });
});

describe("booker tools", () => {
  const tools = getBookerTools(env);
  const booker = { id: 1, names: "Ana", lastNames: "Paz", phoneNumber: "5491111" };

  it("is_booker_registered indica si existe", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValueOnce(booker as any);
    expect(await callTool(tools, "is_booker_registered", { phoneNumber: "5491111" })).toEqual({
      registered: true,
      booker,
    });

    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValueOnce(null as any);
    expect(await callTool(tools, "is_booker_registered", { phoneNumber: "000" })).toEqual({
      registered: false,
      booker: null,
    });
  });

  it("register_booker crea al booker nuevo", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);
    q(bookerQueries.createBooker).mockResolvedValue(booker as any);

    const result = await callTool(tools, "register_booker", { names: "Ana", lastNames: "Paz", phoneNumber: "5491111" });

    expect(bookerQueries.createBooker).toHaveBeenCalledWith(env, {
      names: "Ana",
      lastNames: "Paz",
      phoneNumber: "5491111",
      type: "Booker",
    });
    expect(result).toEqual(booker);
  });

  it("register_booker es idempotente: si ya existe no lo duplica", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(booker as any);

    const result = await callTool(tools, "register_booker", { names: "Ana", lastNames: "Paz", phoneNumber: "5491111" });

    expect(bookerQueries.createBooker).not.toHaveBeenCalled();
    expect(result).toEqual(booker);
  });

  it("register_booker exige nombre, apellido y teléfono", async () => {
    await expect(callTool(tools, "register_booker", { names: "Ana" })).rejects.toThrow();
  });
});
