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
import { BOOKING_DURATION_MINUTES } from "../lib/constants";
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

// Arma la grilla fija de turnos de la cancha para ese día (bloques de
// BOOKING_DURATION_MINUTES desde la apertura) y devuelve solo los que no
// están creados todavía.
async function findAvailableSlots(env: Env, courtId: number, date: string) {
  const schedule = await getScheduleByCourtIdAndDay(env, courtId, getDayOfWeek(date));

  if (!schedule) return [];

  const openMinutes = timeToMinutes(schedule.openingTime);
  const closeMinutes = timeToMinutes(schedule.closingTime);
  const slots: string[] = [];

  for (
    let start = openMinutes;
    start + BOOKING_DURATION_MINUTES <= closeMinutes;
    start += BOOKING_DURATION_MINUTES
  ) {
    const slotStart = slotStartDate(date, start);
    const conflicts = await checkBookingAvailability(env, courtId, slotStart, BOOKING_DURATION_MINUTES);

    if (conflicts === 0) slots.push(slotStart.toISOString());
  }

  return slots;
}

// Un turno solo es válido si arranca justo en uno de los bloques de la
// grilla (apertura, apertura + 90', apertura + 180', ...) y entra completo
// antes del cierre.
async function isValidSlotStart(env: Env, courtId: number, datetime: Date) {
  const date = datetime.toISOString().slice(0, 10);
  const schedule = await getScheduleByCourtIdAndDay(env, courtId, getDayOfWeek(date));

  if (!schedule) return false;

  const openMinutes = timeToMinutes(schedule.openingTime);
  const closeMinutes = timeToMinutes(schedule.closingTime);
  const slotMinutes = datetime.getHours() * 60 + datetime.getMinutes();

  if (slotMinutes < openMinutes || slotMinutes + BOOKING_DURATION_MINUTES > closeMinutes) return false;

  return (slotMinutes - openMinutes) % BOOKING_DURATION_MINUTES === 0;
}

export function getBookingTools(env: Env): Tool[] {
  return [
    {
      name: "get_available_bookings",
      description: "Lists available fixed-length booking slots for a given date, optionally for a specific court",
      inputSchema: getAvailableBookingsInputSchema,
      execute: async (input) => {
        const courts = input.courtId
          ? [await getCourtById(env, input.courtId)].filter((c): c is NonNullable<typeof c> => c !== null)
          : await getAllCourts(env, CourtState.AVAILABLE);

        const availability = [];

        for (const courtRow of courts) {
          const slots = await findAvailableSlots(env, courtRow.id, input.date);

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

        if (!(await isValidSlotStart(env, input.courtId, datetime))) {
          throw new Error("The requested time does not match one of the court's fixed booking slots");
        }

        const conflicts = await checkCourtAvailability(env, input.courtId, datetime, BOOKING_DURATION_MINUTES);

        if (conflicts > 0) {
          throw new Error("The court is not available for the requested time slot");
        }

        return createBooking(env, {
          courtId: input.courtId,
          bookerPhoneNumber: input.bookerPhoneNumber,
          datetime,
          durationMinutes: BOOKING_DURATION_MINUTES,
          bookingState: BookingState.RESERVED,
        });
      },
    },
  ];
}
