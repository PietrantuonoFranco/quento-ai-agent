import { z } from "zod";

import CourtState from "../lib/enums/courtState";
import PlayerCategory from "../lib/enums/playerCategory";

/**
 * Consultar turnos disponibles para una fecha (y opcionalmente una cancha específica).
 * Todos los turnos tienen una duración fija (ver BOOKING_DURATION_MINUTES), así que no
 * se pide como parámetro.
 */
export const getAvailableBookingsInputSchema = z.object({
  date: z.string().describe("Date to check availability for (YYYY-MM-DD)"),
  courtId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Specific court ID to check; if omitted, checks every court"),
});

/**
 * Saber si un booker ya está registrado, a partir de su número de teléfono.
 */
export const isBookerRegisteredInputSchema = z.object({
  phoneNumber: z.string().describe("The booker's phone number"),
});

/**
 * Registrar un nuevo booker.
 */
export const registerBookerInputSchema = z.object({
  names: z.string().describe("The booker's first name(s)"),
  lastNames: z.string().describe("The booker's last name(s)"),
  phoneNumber: z.string().describe("The booker's phone number, used as their unique identifier"),
});

/**
 * Agendar un turno (reserva) para una cancha. La duración es fija (ver
 * BOOKING_DURATION_MINUTES) y el horario debe caer justo en un turno de la
 * grilla de esa cancha (los devueltos por get_available_bookings).
 */
export const createBookingInputSchema = z.object({
  courtId: z.number().int().positive().describe("The court ID to book"),
  bookerPhoneNumber: z.string().describe("The phone number of the registered booker"),
  datetime: z
    .string()
    .describe("ISO datetime for the start of the booking; must match one of the court's fixed slot start times"),
});

/**
 * Saber el estado de las canchas (todas, o una en particular).
 */
export const getCourtStatusInputSchema = z.object({
  courtId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Specific court ID to check; if omitted, returns the status of every court"),
});

/**
 * Saber qué canchas existen, opcionalmente filtradas por estado.
 */
export const listCourtsInputSchema = z.object({
  state: z.nativeEnum(CourtState).optional().describe("Filter courts by their current state"),
});

/**
 * Consultar partidos abiertos (que aún necesitan jugadores).
 */
export const getOpenMatchesInputSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("Filter open matches by the date of their booking (YYYY-MM-DD)"),
  courtId: z.number().int().positive().optional().describe("Filter open matches by court ID"),
  category: z
    .nativeEnum(PlayerCategory)
    .optional()
    .describe("Filter open matches by the players' category"),
});

/**
 * Unirse a un partido abierto.
 */
export const joinMatchInputSchema = z.object({
  matchId: z.number().int().positive().describe("The match ID to join"),
  playerId: z.number().int().positive().describe("The player ID joining the match"),
});

/**
 * Salir de un partido del cual se es miembro.
 */
export const leaveMatchInputSchema = z.object({
  matchId: z.number().int().positive().describe("The match ID to leave"),
  playerId: z.number().int().positive().describe("The player ID leaving the match"),
});
