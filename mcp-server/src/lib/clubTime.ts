import { CLUB_TIMEZONE } from "./constants";

// Fecha de hoy (YYYY-MM-DD) en la zona horaria del club.
export function todayInClubTimezone(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: CLUB_TIMEZONE });
}

// Ahora como hora de pared del club, expresada como Date en UTC nominal (igual que los timestamps de la BD).
export function nowInClubTime(): Date {
  const wallClock = new Date().toLocaleString("sv-SE", { timeZone: CLUB_TIMEZONE });

  return new Date(`${wallClock.replace(" ", "T")}Z`);
}
