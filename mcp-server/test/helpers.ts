import type Env from "../src/lib/interfaces/EnvInterface";
import type Tool from "../src/lib/interfaces/ToolInterface";

export const env: Env = {
  DB: { connectionString: "postgres://test" },
  MCP_API_KEY: "test-key",
};

// "Ahora" fijo: 2026-09-19 (sábado) 09:00 en Buenos Aires (UTC-3) = 12:00Z.
export const NOW_UTC = "2026-09-19T12:00:00Z";
export const TODAY = "2026-09-19";
export const TOMORROW = "2026-09-20"; // domingo

// Ejecuta una tool validando antes el input con su schema zod, como hace el SDK de MCP.
export async function callTool(tools: Tool[], name: string, args: Record<string, unknown> = {}) {
  const tool = tools.find((t) => t.name === name);

  if (!tool) throw new Error(`Tool ${name} not registered`);

  return tool.execute(tool.inputSchema.parse(args));
}

export function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00Z`);
}

export function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    courtId: 1,
    bookerPhoneNumber: "5491111",
    datetime: at(TOMORROW, "12:00"),
    durationMinutes: 90,
    bookingState: "reserved",
    ...overrides,
  };
}

export function schedule(courtId: number, openingTime = "09:00:00", closingTime = "23:00:00") {
  return { courtId, openingTime, closingTime, dayOfWeek: "sunday" };
}
