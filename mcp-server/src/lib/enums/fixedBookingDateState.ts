// Estado de cada fecha de un turno fijo: reservada (tiene su turno), liberada solo
// para esa fecha, o salteada porque al generarla el horario ya estaba ocupado.
enum FixedBookingDateState {
  BOOKED = "booked",
  RELEASED = "released",
  CONFLICT = "conflict",
}

export default FixedBookingDateState;
