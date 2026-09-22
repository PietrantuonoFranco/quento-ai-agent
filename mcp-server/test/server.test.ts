import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/courtQueries");
vi.mock("../src/db/queries/scheduleQueries");
vi.mock("../src/db/queries/bookingQueries");
vi.mock("../src/db/queries/outOfServiceQueries");

import * as courtQueries from "../src/db/queries/courtQueries";
import * as scheduleQueries from "../src/db/queries/scheduleQueries";
import * as bookingQueries from "../src/db/queries/bookingQueries";
import * as outOfServiceQueries from "../src/db/queries/outOfServiceQueries";
import worker from "../src/index";
import { getAllTools } from "../src/tools";
import { env, NOW_UTC, schedule, TOMORROW } from "./helpers";

const MCP_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "x-api-key": env.MCP_API_KEY,
};

function rpc(method: string, params: unknown = {}, headers: Record<string, string> = MCP_HEADERS, id = 1) {
  return new Request("http://localhost/", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

const EXPECTED_TOOLS = [
  "get_available_bookings",
  "get_available_times",
  "check_time_availability",
  "create_booking",
  "get_my_bookings",
  "get_booking_details",
  "cancel_booking",
  "reschedule_booking",
  "is_booker_registered",
  "register_booker",
  "list_courts",
  "get_court_status",
  "get_open_matches",
  "join_match",
  "leave_match",
  "create_match_from_booking",
  "get_club_info",
];

describe("registro de tools", () => {
  it("expone todas las tools sin nombres repetidos", () => {
    const names = getAllTools(env).map((t) => t.name);

    expect([...names].sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("todas tienen descripción y schema de entrada", () => {
    for (const tool of getAllTools(env)) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(typeof tool.inputSchema.parse).toBe("function");
    }
  });
});

describe("Worker fetch handler", () => {
  it("GET /health responde ok", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("un GET cualquiera informa que el server está corriendo", async () => {
    const res = await worker.fetch(new Request("http://localhost/"), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("MCP Server running");
  });

  it("rechaza con 401 si falta la API key", async () => {
    const { "x-api-key": _omit, ...headers } = MCP_HEADERS;
    const res = await worker.fetch(rpc("tools/list", {}, headers), env);

    expect(res.status).toBe(401);
  });

  it("rechaza con 403 si la API key es incorrecta", async () => {
    const res = await worker.fetch(rpc("tools/list", {}, { ...MCP_HEADERS, "x-api-key": "mala" }), env);

    expect(res.status).toBe(403);
  });

  it("tools/list devuelve todas las tools", async () => {
    const res = await worker.fetch(rpc("tools/list"), env);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.tools.map((t: any) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("tools/call ejecuta una tool y devuelve su resultado como texto JSON", async () => {
    vi.mocked(courtQueries.getAllCourts).mockResolvedValue([{ id: 1, number: 1, state: "available" }] as any);

    const res = await worker.fetch(rpc("tools/call", { name: "list_courts", arguments: {} }), env);
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(JSON.parse(body.result.content[0].text)).toEqual([{ id: 1, number: 1, state: "available" }]);
  });

  it("tools/call con argumentos inválidos devuelve error sin romper el server", async () => {
    const res = await worker.fetch(
      rpc("tools/call", { name: "check_time_availability", arguments: { time: "99:99" } }),
      env,
    );
    const body: any = await res.json();

    expect(res.status).toBe(200);
    expect(body.result?.isError ?? Boolean(body.error)).toBe(true);
  });

  it("un error dentro de una tool se informa como isError", async () => {
    vi.mocked(courtQueries.getAllCourts).mockRejectedValue(new Error("db caída"));

    const res = await worker.fetch(rpc("tools/call", { name: "list_courts", arguments: {} }), env);
    const body: any = await res.json();

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("db caída");
  });

  it("atiende requests concurrentes sin 'Internal MCP server error'", async () => {
    // TOMORROW es una fecha fija del fixture: sin esto, con el reloj real la fecha
    // queda en el pasado (los slots se filtran) apenas pasa el día en que se escribió el test.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW_UTC));

    vi.mocked(courtQueries.getAllCourts).mockResolvedValue([{ id: 1, number: 1, state: "available" }] as any);
    vi.mocked(scheduleQueries.getSchedulesByDay).mockResolvedValue([schedule(1)] as any);
    vi.mocked(bookingQueries.getActiveBookingsInRange).mockResolvedValue([]);
    vi.mocked(outOfServiceQueries.getOutOfServicesInRange).mockResolvedValue([]);

    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        worker.fetch(
          rpc("tools/call", { name: "get_available_times", arguments: { date: TOMORROW } }, MCP_HEADERS, i + 1),
          env,
        ),
      ),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);

    const bodies: any[] = await Promise.all(responses.map((r) => r.json()));

    bodies.forEach((body, i) => {
      expect(body.error).toBeUndefined();
      expect(body.id).toBe(i + 1);
      expect(JSON.parse(body.result.content[0].text).times).toHaveLength(9);
    });
  });
});
