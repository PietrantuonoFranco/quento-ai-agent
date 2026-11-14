import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/matchQueries");
vi.mock("../src/db/queries/bookingQueries");
vi.mock("../src/db/queries/bookerQueries");
vi.mock("../src/db/queries/matchPlayerQueries");
vi.mock("../src/db/queries/penaltyQueries");

import * as matchQueries from "../src/db/queries/matchQueries";
import * as bookingQueries from "../src/db/queries/bookingQueries";
import * as bookerQueries from "../src/db/queries/bookerQueries";
import * as matchPlayerQueries from "../src/db/queries/matchPlayerQueries";
import * as penaltyQueries from "../src/db/queries/penaltyQueries";
import { LATE_LEAVE_REASON } from "../src/lib/penalties";
import { getMatchTools } from "../src/tools/matchTools";
import { NOW_UTC, TODAY, TOMORROW, at, bookingRow, callTool, env } from "./helpers";

const tools = getMatchTools(env);
const call = (name: string, args: Record<string, unknown> = {}) => callTool(tools, name, args);
const q = vi.mocked;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW_UTC));
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("get_open_matches", () => {
  it("delega los filtros a la query", async () => {
    q(matchQueries.getOpenMatches).mockResolvedValue([{ id: 1 }] as any);

    const result = await call("get_open_matches", { date: TOMORROW, courtId: 2 });

    expect(matchQueries.getOpenMatches).toHaveBeenCalledWith(env, expect.objectContaining({ date: TOMORROW, courtId: 2 }));
    expect(result).toEqual([{ id: 1 }]);
  });

  it("funciona sin filtros", async () => {
    q(matchQueries.getOpenMatches).mockResolvedValue([]);

    expect(await call("get_open_matches")).toEqual([]);
  });

  it("rechaza una categoría inexistente", async () => {
    await expect(call("get_open_matches", { category: "no-existe" })).rejects.toThrow();
  });
});

describe("join_match", () => {
  it("suma al partido al jugador del teléfono", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 4, type: "Player" } as any);
    q(matchQueries.addPlayerToMatch).mockResolvedValue({ matchId: 3, playerId: 4 } as any);

    await call("join_match", { matchId: 3, phoneNumber: "5492222" });

    expect(bookerQueries.getBookerByPhoneNumber).toHaveBeenCalledWith(env, "5492222");
    expect(matchQueries.addPlayerToMatch).toHaveBeenCalledWith(env, 3, 4);
  });

  it("falla si el teléfono no está registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    await expect(call("join_match", { matchId: 3, phoneNumber: "5492222" })).rejects.toThrow("not registered");
    expect(matchQueries.addPlayerToMatch).not.toHaveBeenCalled();
  });

  it("ya no acepta un playerId elegido por el modelo", () => {
    const tool = tools.find((t) => t.name === "join_match")!;

    expect(() => tool.inputSchema.parse({ matchId: 3, playerId: 4 })).toThrow();
  });
});

describe("leave_match", () => {
  const input = { matchId: 3, phoneNumber: "5492222" };

  beforeEach(() => {
    // El jugador 4 se sumó al partido 3, que es del turno 1 de otro jugador (booker 5).
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 4, type: "Player" } as any);
    q(matchPlayerQueries.getMatchPlayer).mockResolvedValue({ id: 11, matchId: 3, playerId: 4 } as any);
    q(matchQueries.getMatchById).mockResolvedValue({ id: 3, bookingId: 1, needPlayers: false } as any);
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(penaltyQueries.recordPenalty).mockResolvedValue(-20);
  });

  it("quita al jugador del teléfono y el partido vuelve a buscar jugadores", async () => {
    const result = await call("leave_match", input);

    expect(matchPlayerQueries.getMatchPlayer).toHaveBeenCalledWith(env, 3, 4);
    expect(matchPlayerQueries.deleteMatchPlayer).toHaveBeenCalledWith(env, 3, 4);
    expect(matchQueries.reopenMatch).toHaveBeenCalledWith(env, 3);
    expect(penaltyQueries.recordPenalty).not.toHaveBeenCalled();
    expect(result).toEqual({ matchId: 3, left: true, pointsDeducted: 0 });
  });

  it("con menos de 3 horas penaliza y el partido queda como está", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ datetime: at(TODAY, "11:00") }) as any);

    const result = await call("leave_match", input);

    expect(matchPlayerQueries.deleteMatchPlayer).toHaveBeenCalledWith(env, 3, 4);
    expect(penaltyQueries.recordPenalty).toHaveBeenCalledWith(env, 4, 20, LATE_LEAVE_REASON);
    expect(matchQueries.reopenMatch).not.toHaveBeenCalled();
    expect(result.pointsDeducted).toBe(20);
  });

  it("con menos de 3 horas no penaliza a quien no tiene cuenta", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ datetime: at(TODAY, "11:00") }) as any);
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 4, type: "Booker" } as any);

    const result = await call("leave_match", input);

    expect(matchPlayerQueries.deleteMatchPlayer).toHaveBeenCalledWith(env, 3, 4);
    expect(penaltyQueries.recordPenalty).not.toHaveBeenCalled();
    expect(result.pointsDeducted).toBe(0);
  });

  it("usa el mismo error si el teléfono no está registrado o no está en el partido", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValueOnce(null as any);
    const unregistered = await call("leave_match", input).catch((e) => e.message);

    q(matchPlayerQueries.getMatchPlayer).mockResolvedValueOnce(null as any);
    const notInMatch = await call("leave_match", input).catch((e) => e.message);

    expect(unregistered).toBe("You are not a player of this match");
    expect(notInMatch).toBe(unregistered);
    expect(matchPlayerQueries.deleteMatchPlayer).not.toHaveBeenCalled();
  });

  it("quien creó el partido no se baja: tiene que cancelar el turno", async () => {
    q(matchPlayerQueries.getMatchPlayer).mockResolvedValue({ id: 10, matchId: 3, playerId: 5 } as any);
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Player" } as any);

    await expect(call("leave_match", input)).rejects.toThrow("cancel the booking instead");
    expect(matchPlayerQueries.deleteMatchPlayer).not.toHaveBeenCalled();
  });

  it("falla si el turno del partido está cancelado", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookingState: "cancelled" }) as any);

    await expect(call("leave_match", input)).rejects.toThrow("already cancelled");
    expect(matchPlayerQueries.deleteMatchPlayer).not.toHaveBeenCalled();
  });

  it("exige un matchId positivo", async () => {
    await expect(call("leave_match", { matchId: 0, phoneNumber: "5492222" })).rejects.toThrow();
  });
});

describe("create_match_from_booking", () => {
  const input = { bookingId: 1, phoneNumber: "5491111" };

  beforeEach(() => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(matchQueries.getMatchByBookingId).mockResolvedValue(null as any);
    q(matchQueries.createMatch).mockResolvedValue({ id: 20 } as any);
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Booker" } as any);
  });

  it("crea el partido abierto sin cambiar el estado de la reserva", async () => {
    const result = await call("create_match_from_booking", input);

    expect(matchQueries.createMatch).toHaveBeenCalledWith(env, { bookingId: 1, needPlayers: true });
    expect(bookingQueries.updateBookingState).not.toHaveBeenCalled();
    expect(result).toEqual({ matchId: 20, bookingId: 1, needPlayers: true, ownerJoined: false });
  });

  it("suma al dueño como jugador si el booker es un Player", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Player" } as any);

    const result = await call("create_match_from_booking", input);

    expect(matchPlayerQueries.createMatchPlayer).toHaveBeenCalledWith(env, { matchId: 20, playerId: 5 });
    expect(result.ownerJoined).toBe(true);
  });

  it("falla si el teléfono no tiene un booker registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("Booking not found");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva no existe", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(null as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("Booking not found");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva es de otra persona", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookerId: 99 }) as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("Booking not found");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva es un turno de clase", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ lessonId: 3 }) as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("belongs to a class");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva está cancelada", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookingState: "cancelled" }) as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("cancelled");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si el turno ya empezó o pasó", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ datetime: at(TODAY, "08:00") }) as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("already started or passed");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva ya tiene un partido", async () => {
    q(matchQueries.getMatchByBookingId).mockResolvedValue({ id: 3 } as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("already has a match");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
    expect(bookingQueries.updateBookingState).not.toHaveBeenCalled();
  });
});
