import { createBooking, checkBookingAvailability } from "../db/queries/bookingQueries";
import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import { getCourtById, getAllCourts, checkCourtAvailability } from "../db/queries/courtQueries";
import { getScheduleByCourtIdAndDay } from "../db/queries/scheduleQueries";
import {
  getAvailableBookingsInputSchema,
  createBookingInputSchema,
} from "../schemas/inputSchemas";
import BookingState from "../lib/enums/bookingState";
import CourtState from "../lib/enums/courtState";
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

function getDayOfWeek(date: string): DayOfWeek {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function slotStartDate(date: string, minutesSinceMidnight: number): Date {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;

  return new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
}

async function findAvailableSlots(
  env: Env,
  courtId: number,
  date: string,
  durationMinutes: number,
) {
  const schedule = await getScheduleByCourtIdAndDay(env, courtId, getDayOfWeek(date));

  if (!schedule) return [];

  const openMinutes = timeToMinutes(schedule.openingTime);
  const closeMinutes = timeToMinutes(schedule.closingTime);
  const slots: string[] = [];

  for (let start = openMinutes; start + durationMinutes <= closeMinutes; start += durationMinutes) {
    const slotStart = slotStartDate(date, start);
    const conflicts = await checkBookingAvailability(env, courtId, slotStart, durationMinutes);

    if (conflicts === 0) slots.push(slotStart.toISOString());
  }

  return slots;
}

export function getBookingTools(env: Env): Tool[] {
  return [
    {
      name: "get_available_bookings",
      description: "Lists available booking slots for a given date, optionally for a specific court and duration",
      inputSchema: getAvailableBookingsInputSchema,
      execute: async (input) => {
        const durationMinutes = input.durationMinutes ?? 60;
        const courts = input.courtId
          ? [await getCourtById(env, input.courtId)].filter((c): c is NonNullable<typeof c> => c !== null)
          : await getAllCourts(env, CourtState.AVAILABLE);

        const availability = [];

        for (const courtRow of courts) {
          const slots = await findAvailableSlots(env, courtRow.id, input.date, durationMinutes);

          if (slots.length > 0) {
            availability.push({ courtId: courtRow.id, courtNumber: courtRow.number, slots });
          }
        }

        return availability;
      },
    },
    {
      name: "create_booking",
      description: "Books a court for a registered booker at a given date and time",
      inputSchema: createBookingInputSchema,
      execute: async (input) => {
        const booker = await getBookerByPhoneNumber(env, input.bookerPhoneNumber);

        if (!booker) {
          throw new Error("The booker is not registered yet");
        }

        const datetime = new Date(input.datetime);
        const conflicts = await checkCourtAvailability(env, input.courtId, datetime, input.durationMinutes);

        if (conflicts > 0) {
          throw new Error("The court is not available for the requested time slot");
        }

        return createBooking(env, {
          courtId: input.courtId,
          bookerPhoneNumber: input.bookerPhoneNumber,
          datetime,
          durationMinutes: input.durationMinutes,
          bookingState: BookingState.RESERVED,
        });
      },
    },
  ];
}
