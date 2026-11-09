import {
  getCourtById,
  getAllCourts,
  getCourtWithComplexById,
  getCourtWithComplexByNumber,
  getDefaultComplex,
} from "../db/queries/courtQueries";
import { getCourtLocationInputSchema, getCourtStatusInputSchema, listCourtsInputSchema } from "../schemas/inputSchemas";
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
        let match = null;

        if (input.courtId !== undefined) {
          match = await getCourtWithComplexById(env, input.courtId);
        } else if (input.name !== undefined) {
          const numberMatch = input.name.match(/\d+/);
          if (numberMatch) {
            const courtNumber = parseInt(numberMatch[0], 10);
            match = await getCourtWithComplexByNumber(env, courtNumber);
          }
        } else {
          const defaultComplex = await getDefaultComplex(env);
          if (!defaultComplex) {
            throw new Error("Complex location information not found");
          }
          return {
            clubName: defaultComplex.name,
            address: defaultComplex.address,
            city: defaultComplex.city,
            province: defaultComplex.province,
            country: defaultComplex.country,
            postalCode: defaultComplex.postalCode,
            coordinates: {
              latitude: Number(defaultComplex.latitude),
              longitude: Number(defaultComplex.longitude),
            },
            googleMapsUrl: defaultComplex.mapsUrl,
          };
        }

        if (!match) {
          throw new Error("Court not found with the provided id or name");
        }

        const { court: courtRow, complex: complexRow } = match;

        return {
          court: {
            id: courtRow.id,
            number: courtRow.number,
            name: `Cancha ${courtRow.number}`,
          },
          clubName: complexRow.name,
          address: complexRow.address,
          city: complexRow.city,
          province: complexRow.province,
          country: complexRow.country,
          postalCode: complexRow.postalCode,
          coordinates: {
            latitude: Number(complexRow.latitude),
            longitude: Number(complexRow.longitude),
          },
          googleMapsUrl: complexRow.mapsUrl,
        };
      },
    },
  ];
}
