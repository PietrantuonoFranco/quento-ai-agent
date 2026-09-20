import {
  createBooking,
  getActiveBookingsInRange,
  getBookingById,
  cancelBooking,
  rescheduleBooking,
  getUpcomingBookingsByPhone,
} from "../db/queries/bookingQueries";
import { getOutOfServicesInRange } from "../db/queries/outOfServiceQueries";
import { getMatchByBookingId } from "../db/queries/matchQueries";
import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import { getCourtById, getAllCourts, checkCourtAvailability } from "../db/queries/courtQueries";
import { getScheduleByCourtIdAndDay, getSchedulesByDay } from "../db/queries/scheduleQueries";
import {
  getAvailableBookingsInputSchema,
  getAvailableTimesInputSchema,
  checkTimeAvailabilityInputSchema,
  getMyBookingsInputSchema,
  getBookingDetailsInputSchema,
  cancelBookingInputSchema,
  rescheduleBookingInputSchema,
  createBookingInputSchema,
} from "../schemas/inputSchemas";
import BookingState from "../lib/enums/bookingState";
import CourtState from "../lib/enums/courtState";
import DayOfWeek from "../lib/enums/dayOfWeek";
import { BOOKING_DURATION_MINUTES } from "../lib/constants";
import { todayInClubTimezone, nowInClubTime } from "../lib/clubTime";
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

// Los horarios se guardan como hora de pared del club (columnas timestamp sin zona), así que
// todas las fechas se arman y leen en UTC para que no dependan de la zona horaria del servidor.
function getDayOfWeek(date: string): DayOfWeek {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function slotStartDate(date: string, minutesSinceMidnight: number): Date {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;

  return new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

// Arma la grilla fija de turnos de cada cancha para ese día (bloques de BOOKING_DURATION_MINUTES
// desde la apertura) y devuelve solo los que siguen libres. Usa una cantidad fija de queries
// (canchas, horarios, reservas y fuera de servicio del día) sin importar cuántas canchas o turnos haya.
async function collectAvailability(env: Env, date: string, courtId?: number) {
  const courts = courtId
    ? [await getCourtById(env, courtId)].filter((c): c is NonNullable<typeof c> => c !== null)
    : await getAllCourts(env, CourtState.AVAILABLE);

  if (courts.length === 0) return [];

  const dayStart = slotStartDate(date, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
  const [schedules, bookings, outOfServices] = await Promise.all([
    getSchedulesByDay(env, getDayOfWeek(date), courtId),
    getActiveBookingsInRange(env, dayStart, dayEnd, courtId),
    getOutOfServicesInRange(env, dayStart, dayEnd, courtId),
  ]);
  const now = nowInClubTime();
  const availability = [];

  for (const courtRow of courts) {
    // Si la cancha no tiene horario cargado para ese día, se considera cerrada.
    const schedule = schedules.find((s) => s.courtId === courtRow.id);

    if (!schedule) continue;

    const busy = [
      ...bookings
        .filter((b) => b.courtId === courtRow.id)
        .map((b) => ({ from: b.datetime, to: new Date(b.datetime.getTime() + b.durationMinutes * 60000) })),
      ...outOfServices
        .filter((o) => o.courtId === courtRow.id)
        .map((o) => ({ from: o.fromDatetime, to: o.toDatetime })),
    ];

    const openMinutes = timeToMinutes(schedule.openingTime);
    const closeMinutes = timeToMinutes(schedule.closingTime);
    const slots: string[] = [];

    for (
      let start = openMinutes;
      start + BOOKING_DURATION_MINUTES <= closeMinutes;
      start += BOOKING_DURATION_MINUTES
    ) {
      const slotStart = slotStartDate(date, start);
      const slotEnd = new Date(slotStart.getTime() + BOOKING_DURATION_MINUTES * 60000);

      if (slotStart <= now) continue; // turnos que ya empezaron
      if (busy.some((b) => overlaps(slotStart, slotEnd, b.from, b.to))) continue;

      slots.push(slotStart.toISOString());
    }

    if (slots.length > 0) {
      availability.push({ courtId: courtRow.id, courtNumber: courtRow.number, slots });
    }
  }

  return availability;
}

// "2026-09-19T13:00:00.000Z" -> "13:00"
function slotToTime(slot: string): string {
  return slot.slice(11, 16);
}

function parseClubDatetime(value: string): Date {
  // El horario es hora de pared del club: si no trae zona horaria se interpreta como tal (UTC nominal).
  const datetime = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);

  if (Number.isNaN(datetime.getTime())) {
    throw new Error("The requested datetime is not a valid ISO datetime");
  }

  return datetime;
}

// Devuelve la reserva si existe y pertenece a ese teléfono; si no, falla con el mismo mensaje
// para no revelar reservas de otras personas.
async function getOwnedBooking(env: Env, bookingId: number, phoneNumber: string) {
  const bookingRow = await getBookingById(env, bookingId);

  if (!bookingRow || bookingRow.bookerPhoneNumber !== phoneNumber) {
    throw new Error("Booking not found for this phone number");
  }

  return bookingRow;
}

function assertModifiable(bookingRow: { bookingState: string; datetime: Date }) {
  if (bookingRow.bookingState === BookingState.CANCELLED) throw new Error("The booking is already cancelled");
  if (bookingRow.datetime <= nowInClubTime()) throw new Error("The booking has already started or passed");
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
  const slotMinutes = datetime.getUTCHours() * 60 + datetime.getUTCMinutes();

  if (slotMinutes < openMinutes || slotMinutes + BOOKING_DURATION_MINUTES > closeMinutes) return false;

  return (slotMinutes - openMinutes) % BOOKING_DURATION_MINUTES === 0;
}

export function getBookingTools(env: Env): Tool[] {
  return [
    {
      name: "get_available_bookings",
      description:
        "Lists available fixed-length booking slots for a given date (today if omitted), optionally for a specific court",
      inputSchema: getAvailableBookingsInputSchema,
      execute: async (input) => {
        return collectAvailability(env, input.date ?? todayInClubTimezone(), input.courtId);
      },
    },
    {
      name: "get_available_times",
      description:
        "Lists the distinct start times (HH:MM) that have at least one court free on a given date (today if omitted). Times shared by several courts appear only once; use get_available_bookings to see which courts",
      inputSchema: getAvailableTimesInputSchema,
      execute: async (input) => {
        const date = input.date ?? todayInClubTimezone();
        const availability = await collectAvailability(env, date);
        const times = [...new Set(availability.flatMap((court) => court.slots.map(slotToTime)))].sort();

        return { date, durationMinutes: BOOKING_DURATION_MINUTES, times };
      },
    },
    {
      name: "check_time_availability",
      description:
        "Checks whether a specific start time (HH:MM) is bookable on a given date (today if omitted) and which courts are free at that time. If it is not available, returns the other available times that day",
      inputSchema: checkTimeAvailabilityInputSchema,
      execute: async (input) => {
        const date = input.date ?? todayInClubTimezone();
        const availability = await collectAvailability(env, date);
        const courts = availability
          .filter((court) => court.slots.some((slot) => slotToTime(slot) === input.time))
          .map(({ courtId, courtNumber }) => ({ courtId, courtNumber }));

        if (courts.length > 0) {
          return { date, time: input.time, available: true, courts };
        }

        const availableTimes = [...new Set(availability.flatMap((court) => court.slots.map(slotToTime)))].sort();

        return { date, time: input.time, available: false, courts: [], availableTimes };
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

        const datetime = parseClubDatetime(input.datetime);

        if (datetime <= nowInClubTime()) {
          throw new Error("The requested time is in the past");
        }

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
    {
      name: "get_my_bookings",
      description: "Lists the upcoming (not cancelled) bookings of a booker, identified by phone number",
      inputSchema: getMyBookingsInputSchema,
      execute: async (input) => {
        const bookings = await getUpcomingBookingsByPhone(env, input.phoneNumber, nowInClubTime());
        const courts = await getAllCourts(env);

        return bookings.map((b) => ({
          bookingId: b.id,
          courtId: b.courtId,
          courtNumber: courts.find((c) => c.id === b.courtId)?.number,
          datetime: b.datetime.toISOString(),
          durationMinutes: b.durationMinutes,
          bookingState: b.bookingState,
        }));
      },
    },
    {
      name: "get_booking_details",
      description: "Returns the details of one booking (court, time, state and match info) for its owner",
      inputSchema: getBookingDetailsInputSchema,
      execute: async (input) => {
        const bookingRow = await getOwnedBooking(env, input.bookingId, input.phoneNumber);
        const courtRow = await getCourtById(env, bookingRow.courtId);
        const matchRow = await getMatchByBookingId(env, bookingRow.id);

        return {
          bookingId: bookingRow.id,
          courtId: bookingRow.courtId,
          courtNumber: courtRow?.number,
          datetime: bookingRow.datetime.toISOString(),
          durationMinutes: bookingRow.durationMinutes,
          bookingState: bookingRow.bookingState,
          match: matchRow ? { matchId: matchRow.id, needPlayers: matchRow.needPlayers } : null,
        };
      },
    },
    {
      name: "cancel_booking",
      description: "Cancels an upcoming booking; only its owner (matching phone number) can cancel it",
      inputSchema: cancelBookingInputSchema,
      execute: async (input) => {
        const bookingRow = await getOwnedBooking(env, input.bookingId, input.phoneNumber);

        assertModifiable(bookingRow);

        const cancelled = await cancelBooking(env, bookingRow.id);

        return { bookingId: bookingRow.id, bookingState: cancelled?.bookingState, datetime: bookingRow.datetime.toISOString() };
      },
    },
    {
      name: "reschedule_booking",
      description:
        "Moves an upcoming booking to a new start time (and optionally another court) if that slot is free; only the owner can do it",
      inputSchema: rescheduleBookingInputSchema,
      execute: async (input) => {
        const bookingRow = await getOwnedBooking(env, input.bookingId, input.phoneNumber);

        assertModifiable(bookingRow);

        const courtId = input.courtId ?? bookingRow.courtId;
        const datetime = parseClubDatetime(input.newDatetime);

        if (datetime <= nowInClubTime()) {
          throw new Error("The requested time is in the past");
        }

        if (!(await isValidSlotStart(env, courtId, datetime))) {
          throw new Error("The requested time does not match one of the court's fixed booking slots");
        }

        const conflicts = await checkCourtAvailability(env, courtId, datetime, bookingRow.durationMinutes, bookingRow.id);

        if (conflicts > 0) {
          throw new Error("The court is not available for the requested time slot");
        }

        const updated = await rescheduleBooking(env, bookingRow.id, courtId, datetime);

        return {
          bookingId: bookingRow.id,
          courtId,
          datetime: updated?.datetime.toISOString(),
          durationMinutes: bookingRow.durationMinutes,
        };
      },
    },
  ];
}
