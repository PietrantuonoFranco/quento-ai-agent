import { getBookerByPhoneNumber, createBooker } from "../db/queries/bookerQueries";
import {
  isBookerRegisteredInputSchema,
  registerBookerInputSchema,
} from "../schemas/inputSchemas";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getBookerTools(env: Env): Tool[] {
  return [
    {
      name: "is_booker_registered",
      description: "Checks whether a booker is already registered, given their phone number",
      inputSchema: isBookerRegisteredInputSchema,
      execute: async (input) => {
        const booker = await getBookerByPhoneNumber(env, input.phoneNumber);

        return { registered: booker !== null, booker };
      },
    },
    {
      name: "register_booker",
      description: "Registers a new booker with their name and phone number",
      inputSchema: registerBookerInputSchema,
      execute: async (input) => {
        const existing = await getBookerByPhoneNumber(env, input.phoneNumber);

        if (existing) return existing;

        return createBooker(env, input);
      },
    },
  ];
}
