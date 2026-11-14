// Un turno está reservado hasta que termina (el job de asistencia de la web lo pasa a
// finalizado) o hasta que se cancela. Si se pagó va aparte (bookings.is_paid).
enum BookingState {
  RESERVED = "reserved",
  FINISHED = "finished",
  CANCELLED = "cancelled",
}

export default BookingState;
