import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import {
  cancelFixedBooking,
  getActiveFixedBookingsByBookerId,
  getFixedBookingById,
} from "../db/queries/fixedBookingQueries";
import { cancelFixedBookingInputSchema, getMyFixedBookingsInputSchema } from "../schemas/inputSchemas";
import { nowInClubTime } from "../lib/clubTime";
import DayOfWeek from "../lib/enums/dayOfWeek";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

const WEEKDAYS = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// El día de la semana de un turno fijo es el de su fecha de inicio (YYYY-MM-DD).
function dayOfWeekOf(date: string): DayOfWeek {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function getFixedBookingTools(env: Env): Tool[] {
  return [
    {
      name: "get_my_fixed_bookings",
      description:
        "Lists the active fixed (recurring) bookings of a booker, identified by phone number: court, day of the week, start time and frequency (weekly or biweekly)",
      inputSchema: getMyFixedBookingsInputSchema,
      execute: async (input) => {
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);

        if (!bookerRow) return [];

        const fixedBookings = await getActiveFixedBookingsByBookerId(env, bookerRow.id);

        return fixedBookings.map((f) => ({
          fixedBookingId: f.id,
          courtId: f.courtId,
          courtNumber: f.courtNumber,
          dayOfWeek: dayOfWeekOf(f.startDate),
          startTime: f.startTime.slice(0, 5),
          durationMinutes: f.durationMinutes,
          frequency: f.frequency,
          startDate: f.startDate,
          endDate: f.endDate,
        }));
      },
    },
    {
      name: "cancel_fixed_booking",
      description:
        "Cancels a whole fixed (recurring) booking so it is not booked anymore: cancels all its upcoming dates, without penalty. Only its holder can do it. To cancel a single date use cancel_booking instead",
      inputSchema: cancelFixedBookingInputSchema,
      execute: async (input) => {
        const [fixedRow, bookerRow] = await Promise.all([
          getFixedBookingById(env, input.fixedBookingId),
          getBookerByPhoneNumber(env, input.phoneNumber),
        ]);

        // Mismo mensaje en todos los casos para no revelar turnos fijos de otras personas.
        if (!fixedRow || !bookerRow || fixedRow.bookerId !== bookerRow.id) {
          throw new Error("Fixed booking not found for this phone number");
        }

        if (!fixedRow.isActive) throw new Error("The fixed booking is already cancelled");

        const cancelledDates = await cancelFixedBooking(env, fixedRow.id, nowInClubTime());

        return { fixedBookingId: fixedRow.id, cancelledDates };
      },
    },
  ];
}
