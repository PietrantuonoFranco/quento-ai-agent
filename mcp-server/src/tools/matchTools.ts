import { getOpenMatches, addPlayerToMatch, createMatch, getMatchByBookingId } from "../db/queries/matchQueries";
import { getBookingById } from "../db/queries/bookingQueries";
import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import { createMatchPlayer } from "../db/queries/matchPlayerQueries";
import { nowInClubTime } from "../lib/clubTime";
import BookingState from "../lib/enums/bookingState";
import BookerType from "../lib/enums/bookerType";
import { deleteMatchPlayer } from "../db/queries/matchPlayerQueries";
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
      description: "Adds a player to an open match",
      inputSchema: joinMatchInputSchema,
      execute: async (input) => addPlayerToMatch(env, input.matchId, input.playerId),
    },
    {
      name: "leave_match",
      description: "Removes a player from a match they are a member of",
      inputSchema: leaveMatchInputSchema,
      execute: async (input) => deleteMatchPlayer(env, input.matchId, input.playerId),
    },
    {
      name: "create_match_from_booking",
      description:
        "Turns an upcoming booking into an open match that looks for players; only the booking's owner can do it. If the booker has an associated player, they are added to the match",
      inputSchema: createMatchFromBookingInputSchema,
      execute: async (input) => {
        const bookingRow = await getBookingById(env, input.bookingId);

        if (!bookingRow || bookingRow.bookerPhoneNumber !== input.phoneNumber) {
          throw new Error("Booking not found for this phone number");
        }

        if (bookingRow.bookingState === BookingState.CANCELLED) throw new Error("The booking is cancelled");
        if (bookingRow.datetime <= nowInClubTime()) throw new Error("The booking has already started or passed");
        if (await getMatchByBookingId(env, bookingRow.id)) throw new Error("This booking already has a match");

        const matchRow = await createMatch(env, { bookingId: bookingRow.id, needPlayers: true });

        // Un Player es un booker con type "Player", así que su id de jugador es el mismo id de booker.
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);
        const ownerIsPlayer = bookerRow?.type === BookerType.PLAYER;

        if (ownerIsPlayer) await createMatchPlayer(env, { matchId: matchRow.id, playerId: bookerRow.id });

        return { matchId: matchRow.id, bookingId: bookingRow.id, needPlayers: true, ownerJoined: ownerIsPlayer };
      },
    },
  ];
}
