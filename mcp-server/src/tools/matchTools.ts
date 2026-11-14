import {
  getOpenMatches,
  addPlayerToMatch,
  createMatch,
  getMatchById,
  getMatchByBookingId,
  reopenMatch,
} from "../db/queries/matchQueries";
import { getBookingById } from "../db/queries/bookingQueries";
import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import { createMatchPlayer, deleteMatchPlayer, getMatchPlayer } from "../db/queries/matchPlayerQueries";
import { recordPenalty } from "../db/queries/penaltyQueries";
import { nowInClubTime } from "../lib/clubTime";
import BookingState from "../lib/enums/bookingState";
import BookerType from "../lib/enums/bookerType";
import { LATE_LEAVE_REASON, PENALTY_POINTS, isLateCancellation } from "../lib/penalties";
import {
  getOpenMatchesInputSchema,
  createMatchFromBookingInputSchema,
  joinMatchInputSchema,
  leaveMatchInputSchema,
} from "../schemas/inputSchemas";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getMatchTools(env: Env): Tool[] {
  return [
    {
      name: "get_open_matches",
      description: "Lists open matches that still need players, optionally filtered by date, court or player category",
      inputSchema: getOpenMatchesInputSchema,
      execute: async (input) => getOpenMatches(env, input),
    },
    {
      name: "join_match",
      description: "Adds the player who owns the phone number to an open match",
      inputSchema: joinMatchInputSchema,
      execute: async (input) => {
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);

        if (!bookerRow) throw new Error("The player is not registered yet");

        return addPlayerToMatch(env, input.matchId, bookerRow.id);
      },
    },
    {
      name: "leave_match",
      description:
        "Removes the player who owns the phone number from a match they joined. Leaving less than 3 hours before the start deducts 20 loyalty points from players with an account (pointsDeducted) and the spot is not reopened. The match creator cannot leave: they must cancel the booking",
      inputSchema: leaveMatchInputSchema,
      execute: async (input) => {
        // Mismas reglas que leaveMatch de la web.
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);
        const matchPlayerRow = bookerRow ? await getMatchPlayer(env, input.matchId, bookerRow.id) : null;

        if (!bookerRow || !matchPlayerRow) throw new Error("You are not a player of this match");

        const matchRow = await getMatchById(env, input.matchId);
        const bookingRow = matchRow?.bookingId ? await getBookingById(env, matchRow.bookingId) : null;

        if (!bookingRow) throw new Error("You are not a player of this match");
        if (bookingRow.bookerId === bookerRow.id) {
          throw new Error("The match creator cannot leave; cancel the booking instead");
        }
        if (bookingRow.bookingState === BookingState.CANCELLED) throw new Error("The booking is already cancelled");

        await deleteMatchPlayer(env, input.matchId, bookerRow.id);

        // Una baja tardía no libera el lugar: el partido queda como está y se penaliza.
        if (!isLateCancellation(bookingRow.datetime, nowInClubTime())) {
          await reopenMatch(env, input.matchId);

          return { matchId: input.matchId, left: true, pointsDeducted: 0 };
        }

        const amount =
          bookerRow.type === BookerType.PLAYER
            ? await recordPenalty(env, bookerRow.id, PENALTY_POINTS, LATE_LEAVE_REASON)
            : 0;

        return { matchId: input.matchId, left: true, pointsDeducted: Math.abs(amount) };
      },
    },
    {
      name: "create_match_from_booking",
      description:
        "Turns an upcoming booking into an open match that looks for players; only the booking's owner can do it. If the booker has an associated player, they are added to the match",
      inputSchema: createMatchFromBookingInputSchema,
      execute: async (input) => {
        const [bookingRow, bookerRow] = await Promise.all([
          getBookingById(env, input.bookingId),
          getBookerByPhoneNumber(env, input.phoneNumber),
        ]);

        if (!bookingRow || !bookerRow || bookingRow.bookerId !== bookerRow.id) {
          throw new Error("Booking not found for this phone number");
        }

        if (bookingRow.lessonId !== null) throw new Error("This booking belongs to a class and cannot become a match");
        if (bookingRow.bookingState === BookingState.CANCELLED) throw new Error("The booking is cancelled");
        if (bookingRow.datetime <= nowInClubTime()) throw new Error("The booking has already started or passed");
        if (await getMatchByBookingId(env, bookingRow.id)) throw new Error("This booking already has a match");

        const matchRow = await createMatch(env, { bookingId: bookingRow.id, needPlayers: true });

        // Un Player es un booker con type "Player", así que su id de jugador es el mismo id de booker.
        const ownerIsPlayer = bookerRow.type === BookerType.PLAYER;

        if (ownerIsPlayer) await createMatchPlayer(env, { matchId: matchRow.id, playerId: bookerRow.id });

        return { matchId: matchRow.id, bookingId: bookingRow.id, needPlayers: true, ownerJoined: ownerIsPlayer };
      },
    },
  ];
}
