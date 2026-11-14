// Reglas de inscripción a clases, copiadas de enrollStudent de la web (padel-quento:
// src/lib/lessons.ts). Las fechas son hora de pared del club (ver nowInClubTime).

type LessonRules = {
  teacherId: number;
  isActive: boolean;
  toLocalDatetime: Date | null;
  classCapacity: number;
};

// Una clase admite alumnos mientras esté activa y no haya terminado (sin fecha de fin, o con el fin por delante).
export function isLessonOpen(lesson: Pick<LessonRules, "isActive" | "toLocalDatetime">, now: Date): boolean {
  return lesson.isActive && (lesson.toLocalDatetime === null || lesson.toLocalDatetime > now);
}

// Motivo por el que `playerId` no puede inscribirse en la clase, o null si puede.
// `studentIds` son los alumnos ya inscriptos.
export function enrollmentError(lesson: LessonRules, studentIds: number[], playerId: number, now: Date): string | null {
  if (!lesson.isActive) return "The class was cancelled";
  if (!isLessonOpen(lesson, now)) return "The class has already finished";
  if (lesson.teacherId === playerId) return "The teacher cannot enroll in their own class";
  if (studentIds.includes(playerId)) return "You are already enrolled in this class";
  if (studentIds.length >= lesson.classCapacity) return "The class is full";

  return null;
}
