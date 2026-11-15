// Avisos que manda el bot por WhatsApp cuando una acción afecta a otras personas. Son las
// mismas plantillas aprobadas por Meta que usa la web (padel-quento/src/domain/notifications.ts),
// con el mismo nombre y el mismo orden de parámetros: si cambian allá, hay que cambiarlas acá.

export type WhatsAppTemplate = { name: string; parameters: string[] };

export type NoticeBooking = { datetime: Date; courtNumber: number };

// Los turnos se guardan como hora de pared del club en UTC nominal, así que se formatean en UTC.
const DAY_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function describeBooking(booking: NoticeBooking) {
  const hours = String(booking.datetime.getUTCHours()).padStart(2, "0");
  const minutes = String(booking.datetime.getUTCMinutes()).padStart(2, "0");

  return {
    day: DAY_FORMATTER.format(booking.datetime).replace(",", ""),
    time: `${hours}:${minutes}`,
    court: String(booking.courtNumber),
  };
}

// Quien armó el partido canceló el turno: se avisa a los demás jugadores.
export function matchCancelledByCreatorNotice(recipientName: string, creatorName: string, booking: NoticeBooking): WhatsAppTemplate {
  const { day, time, court } = describeBooking(booking);

  return { name: "quento_partido_cancelado", parameters: [recipientName, creatorName, day, time, court] };
}

// El profesor canceló una fecha de su clase: se avisa a los alumnos.
export function classCancelledByTeacherNotice(recipientName: string, teacherName: string, booking: NoticeBooking): WhatsAppTemplate {
  const { day, time, court } = describeBooking(booking);

  return { name: "quento_clase_cancelada_profesor", parameters: [recipientName, teacherName, day, time, court] };
}
