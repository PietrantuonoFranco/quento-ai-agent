import { getBookingTools } from "./bookingTools";
import { getBookerTools } from "./bookerTools";
import { getCourtTools } from "./courtTools";
import { getClubTools } from "./clubTools";
import { getFixedBookingTools } from "./fixedBookingTools";
import { getLessonTools } from "./lessonTools";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

export function getAllTools(env: Env): Tool[] {
  return [
    ...getBookingTools(env),
    ...getBookerTools(env),
    ...getCourtTools(env),
    ...getClubTools(env),
    ...getFixedBookingTools(env),
    ...getLessonTools(env),
  ];
}
