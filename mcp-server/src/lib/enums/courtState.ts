// Una cancha está disponible o dada de baja; los bloqueos temporales son
// períodos fuera de servicio (tabla out_of_services).
enum CourtState {
  AVAILABLE = "available",
  CLOSED_DOWN = "closed_down",
}

export default CourtState;
