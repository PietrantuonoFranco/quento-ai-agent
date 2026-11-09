// Todos los turnos duran lo mismo: la grilla de horarios de cada cancha se arma
// en bloques fijos de esta duración a partir del horario de apertura.
export const BOOKING_DURATION_MINUTES = 90;

// Zona horaria del club: define qué día es "hoy" cuando no se pide una fecha (el worker corre en UTC).
export const CLUB_TIMEZONE = "America/Argentina/Buenos_Aires";

// Ubicación física y datos del complejo Quento Club
export const CLUB_NAME = "Quento Club";
export const CLUB_ADDRESS = "Cam. Centenario 8907, B1894 Villa Elisa, Buenos Aires";
export const CLUB_CITY = "Villa Elisa";
export const CLUB_COORDINATES = {
  latitude: -34.8637264,
  longitude: -58.0610566,
};
export const CLUB_MAPS_URL = "https://maps.app.goo.gl/G4LpSDfyxCWAJHDSA";
