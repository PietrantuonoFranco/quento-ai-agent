import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/matchQueries");
vi.mock("../src/db/queries/bookingQueries");
vi.mock("../src/db/queries/bookerQueries");
vi.mock("../src/db/queries/playerQueries");
vi.mock("../src/db/queries/matchPlayerQueries");

import * as matchQueries from "../src/db/queries/matchQueries";
import * as bookingQueries from "../src/db/queries/bookingQueries";
import * as bookerQueries from "../src/db/queries/bookerQueries";
import * as playerQueries from "../src/db/queries/playerQueries";
import * as matchPlayerQueries from "../src/db/queries/matchPlayerQueries";
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

describe("join_match / leave_match", () => {
  it("join_match suma al jugador al partido", async () => {
    q(matchQueries.addPlayerToMatch).mockResolvedValue({ matchId: 3, playerId: 4 } as any);

    await call("join_match", { matchId: 3, playerId: 4 });

    expect(matchQueries.addPlayerToMatch).toHaveBeenCalledWith(env, 3, 4);
  });

  it("leave_match quita al jugador del partido", async () => {
    await call("leave_match", { matchId: 3, playerId: 4 });

    expect(matchPlayerQueries.deleteMatchPlayer).toHaveBeenCalledWith(env, 3, 4);
  });

  it.each(["join_match", "leave_match"])("%s exige ids positivos", async (name) => {
    await expect(call(name, { matchId: 0, playerId: 4 })).rejects.toThrow();
    await expect(call(name, { matchId: 3 })).rejects.toThrow();
  });
});

describe("create_match_from_booking", () => {
  const input = { bookingId: 1, phoneNumber: "5491111" };

  beforeEach(() => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow() as any);
    q(matchQueries.getMatchByBookingId).mockResolvedValue(null as any);
    q(matchQueries.createMatch).mockResolvedValue({ id: 20 } as any);
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5 } as any);
    q(playerQueries.getPlayerByBookerId).mockResolvedValue(null as any);
  });

  it("crea el partido abierto y pasa la reserva a pending_players", async () => {
    const result = await call("create_match_from_booking", input);

    expect(matchQueries.createMatch).toHaveBeenCalledWith(env, { bookingId: 1, needPlayers: true });
    expect(bookingQueries.updateBookingState).toHaveBeenCalledWith(env, 1, "pending_players");
    expect(result).toEqual({ matchId: 20, bookingId: 1, needPlayers: true, ownerJoined: false });
  });

  it("suma al dueño como jugador si el booker tiene un player asociado", async () => {
    q(playerQueries.getPlayerByBookerId).mockResolvedValue({ id: 8 } as any);

    const result = await call("create_match_from_booking", input);

    expect(playerQueries.getPlayerByBookerId).toHaveBeenCalledWith(env, 5);
    expect(matchPlayerQueries.createMatchPlayer).toHaveBeenCalledWith(env, { matchId: 20, playerId: 8 });
    expect(result.ownerJoined).toBe(true);
  });

  it("no agrega jugadores si el booker no existe", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    const result = await call("create_match_from_booking", input);

    expect(matchPlayerQueries.createMatchPlayer).not.toHaveBeenCalled();
    expect(result.ownerJoined).toBe(false);
  });

  it("falla si la reserva no existe", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(null as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("Booking not found");
    expect(matchQueries.createMatch).not.toHaveBeenCalled();
  });

  it("falla si la reserva es de otra persona", async () => {
    q(bookingQueries.getBookingById).mockResolvedValue(bookingRow({ bookerPhoneNumber: "otro" }) as any);

    await expect(call("create_match_from_booking", input)).rejects.toThrow("Booking not found");
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
