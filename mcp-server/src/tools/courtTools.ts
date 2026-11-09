import { getCourtById, getCourtByNumber, getAllCourts } from "../db/queries/courtQueries";
import { getCourtLocationInputSchema, getCourtStatusInputSchema, listCourtsInputSchema } from "../schemas/inputSchemas";
import { CLUB_NAME, CLUB_ADDRESS, CLUB_CITY, CLUB_COORDINATES, CLUB_MAPS_URL } from "../lib/constants";
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
    {
      name: "get_court_location",
      description: "Gets the location, address, coordinates and Google Maps link for a specific court or the club complex",
      inputSchema: getCourtLocationInputSchema,
      execute: async (input) => {
        let courtRow = null;

        if (input.courtId !== undefined) {
          courtRow = await getCourtById(env, input.courtId);
        } else if (input.name !== undefined) {
          const match = input.name.match(/\d+/);
          if (match) {
            const courtNumber = parseInt(match[0], 10);
            courtRow = await getCourtByNumber(env, courtNumber);
          }
        }

        if (!courtRow) {
          throw new Error("Court not found with the provided id or name");
        }

        return {
          court: {
            id: courtRow.id,
            number: courtRow.number,
            name: `Cancha ${courtRow.number}`,
          },
          clubName: CLUB_NAME,
          address: CLUB_ADDRESS,
          city: CLUB_CITY,
          coordinates: CLUB_COORDINATES,
          googleMapsUrl: CLUB_MAPS_URL,
        };
      },
    },
  ];
}
