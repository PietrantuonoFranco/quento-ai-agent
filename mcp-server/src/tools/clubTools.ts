import { getAllCourts } from "../db/queries/courtQueries";
import { getAllSchedules } from "../db/queries/scheduleQueries";
import { getClubInfoInputSchema } from "../schemas/inputSchemas";
import { BOOKING_DURATION_MINUTES, CLUB_TIMEZONE } from "../lib/constants";
import DayOfWeek from "../lib/enums/dayOfWeek";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getClubTools(env: Env): Tool[] {
  return [
    {
      name: "get_club_info",
      description:
        "General club information: number of courts by state, opening hours per day of the week, slot duration and timezone. Does not include prices or cancellation policy",
      inputSchema: getClubInfoInputSchema,
      execute: async () => {
        const courts = await getAllCourts(env);
        const schedules = await getAllSchedules(env);

        const courtsByState: Record<string, number> = {};

        for (const courtRow of courts) {
          courtsByState[courtRow.state] = (courtsByState[courtRow.state] ?? 0) + 1;
        }

        // Cada día se resume como el rango más amplio entre las canchas (apertura mínima, cierre máximo).
        const openingHours = Object.values(DayOfWeek).map((dayOfWeek) => {
          const daily = schedules.filter((s) => s.dayOfWeek === dayOfWeek);

          if (daily.length === 0) return { dayOfWeek, open: false };

          return {
            dayOfWeek,
            open: true,
            openingTime: daily.map((s) => s.openingTime).sort()[0].slice(0, 5),
            closingTime: daily.map((s) => s.closingTime).sort().at(-1)!.slice(0, 5),
          };
        });

        return {
          totalCourts: courts.length,
          courtsByState,
          openingHours,
          slotDurationMinutes: BOOKING_DURATION_MINUTES,
          timezone: CLUB_TIMEZONE,
        };
      },
    },
  ];
}
