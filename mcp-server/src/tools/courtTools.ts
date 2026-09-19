import { getCourtById, getAllCourts } from "../db/queries/courtQueries";
import { getCourtStatusInputSchema, listCourtsInputSchema } from "../schemas/inputSchemas";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getCourtTools(env: Env): Tool[] {
  return [
    {
      name: "get_court_status",
      description: "Gets the current status of a specific court, or every court if none is specified",
      inputSchema: getCourtStatusInputSchema,
      execute: async (input) => {
        if (input.courtId !== undefined) {
          const courtRow = await getCourtById(env, input.courtId);

          return courtRow ? [courtRow] : [];
        }

        return getAllCourts(env);
      },
    },
    {
      name: "list_courts",
      description: "Lists every court, optionally filtered by state",
      inputSchema: listCourtsInputSchema,
      execute: async (input) => getAllCourts(env, input.state),
    },
  ];
}
