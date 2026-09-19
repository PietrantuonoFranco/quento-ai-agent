import { getOpenMatches, addPlayerToMatch } from "../db/queries/matchQueries";
import { deleteMatchPlayer } from "../db/queries/matchPlayerQueries";
import {
  getOpenMatchesInputSchema,
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
  ];
}
