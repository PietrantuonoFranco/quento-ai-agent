import { getBookingTools } from "./bookingTools";
import { getBookerTools } from "./bookerTools";
import { getCourtTools } from "./courtTools";
import { getMatchTools } from "./matchTools";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getAllTools(env: Env): Tool[] {
  return [
    ...getBookingTools(env),
    ...getBookerTools(env),
    ...getCourtTools(env),
    ...getMatchTools(env),
  ];
}
