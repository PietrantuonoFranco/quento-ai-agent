import { getDb } from "../database";
import { booker, court, inscription, lesson, lessonSchedule } from "../schemas";
import { and, asc, eq, getTableColumns, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import { enrollmentError } from "../../lib/lessons";

// Clave del advisory lock que usa la web para serializar las inscripciones de una clase
// (LESSON_LOCK_CLASS en padel-quento/src/lib/lessons.ts): con la misma clave, el bot y la
// web no pueden pasarse del cupo inscribiendo a la vez.
const LESSON_LOCK_CLASS = 43;

// Clases activas que todavía no terminaron (`now` en hora de pared del club), con el nombre
// del profesor, sus horarios (con número de cancha) y los ids de sus alumnos.
export async function getOpenLessons(env: Env, now: Date) {
  const db = getDb(env);
  const lessons = await db
    .select({ ...getTableColumns(lesson), teacherNames: booker.names, teacherLastNames: booker.lastNames })
    .from(lesson)
    .innerJoin(booker, eq(lesson.teacherId, booker.id))
    .where(
      and(
        eq(lesson.isActive, true),
        or(isNull(lesson.toLocalDatetime), gt(lesson.toLocalDatetime, sql`${now.toISOString()}::timestamp`)),
      ),
    )
    .orderBy(asc(lesson.fromLocalDatetime), asc(lesson.id));

  if (lessons.length === 0) return [];

  const lessonIds = lessons.map((row) => row.id);
  const schedules = await db
    .select({
      lessonId: lessonSchedule.lessonId,
      courtId: lessonSchedule.courtId,
      courtNumber: court.number,
      dayOfWeek: lessonSchedule.dayOfWeek,
      startTime: lessonSchedule.startTime,
      endTime: lessonSchedule.endTime,
    })
    .from(lessonSchedule)
    .innerJoin(court, eq(lessonSchedule.courtId, court.id))
    .where(inArray(lessonSchedule.lessonId, lessonIds));
  const students = await db
    .select({ lessonId: inscription.lessonId, playerId: inscription.playerId })
    .from(inscription)
    .where(inArray(inscription.lessonId, lessonIds));

  return lessons.map((row) => ({
    ...row,
    schedules: schedules
      .filter((s) => s.lessonId === row.id)
      .map(({ courtId, courtNumber, dayOfWeek, startTime, endTime }) => ({ courtId, courtNumber, dayOfWeek, startTime, endTime })),
    studentIds: students.filter((s) => s.lessonId === row.id).map((s) => s.playerId),
  }));
}

// Inscribe al jugador con las reglas de la web (ver enrollmentError), bajo el mismo lock que
// ella. Devuelve el motivo por el que no se pudo, o null si quedó inscripto.
export async function enrollInLesson(env: Env, lessonId: number, playerId: number, now: Date) {
  const db = getDb(env);

  return db.transaction(async (tx): Promise<string | null> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LESSON_LOCK_CLASS}::int, ${lessonId}::int)`);

    const [lessonRow] = await tx.select().from(lesson).where(eq(lesson.id, lessonId)).limit(1);

    if (!lessonRow) return "The class does not exist";

    const students = await tx
      .select({ playerId: inscription.playerId })
      .from(inscription)
      .where(eq(inscription.lessonId, lessonId));
    const error = enrollmentError(lessonRow, students.map((s) => s.playerId), playerId, now);

    if (error) return error;

    await tx.insert(inscription).values({ lessonId, playerId });

    return null;
  });
}

// Da de baja al jugador de la clase. Devuelve false si no estaba inscripto.
export async function unenrollFromLesson(env: Env, lessonId: number, playerId: number) {
  const db = getDb(env);
  const deleted = await db
    .delete(inscription)
    .where(and(eq(inscription.lessonId, lessonId), eq(inscription.playerId, playerId)))
    .returning({ id: inscription.id });

  return deleted.length > 0;
}
