import { getBookerByPhoneNumber } from "../db/queries/bookerQueries";
import { enrollInLesson, getOpenLessons, unenrollFromLesson } from "../db/queries/lessonQueries";
import {
  enrollInLessonInputSchema,
  getAvailableLessonsInputSchema,
  getMyLessonsInputSchema,
  leaveLessonInputSchema,
} from "../schemas/inputSchemas";
import { nowInClubTime } from "../lib/clubTime";
import BookerType from "../lib/enums/bookerType";
import DayOfWeek from "../lib/enums/dayOfWeek";
import type Env from "../lib/interfaces/EnvInterface";
import type Tool from "../lib/interfaces/ToolInterface";

type OpenLesson = Awaited<ReturnType<typeof getOpenLessons>>[number];

const DAY_ORDER: string[] = Object.values(DayOfWeek); // monday ... sunday

// Misma forma que muestra la web (toLessonItem), sin la lista de alumnos: solo cuántos son.
function toLessonItem(row: OpenLesson, playerId: number | null) {
  return {
    lessonId: row.id,
    teacherName: `${row.teacherNames} ${row.teacherLastNames}`,
    price: Number(row.price),
    classCapacity: row.classCapacity,
    studentsCount: row.studentIds.length,
    availableSpots: Math.max(row.classCapacity - row.studentIds.length, 0),
    fromDate: row.fromLocalDatetime.toISOString().slice(0, 10),
    toDate: row.toLocalDatetime ? row.toLocalDatetime.toISOString().slice(0, 10) : null,
    schedules: [...row.schedules]
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime),
      )
      .map((s) => ({
        courtNumber: s.courtNumber,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
      })),
    isEnrolled: playerId !== null && row.studentIds.includes(playerId),
    isOwn: playerId !== null && row.teacherId === playerId,
  };
}

export function getLessonTools(env: Env): Tool[] {
  return [
    {
      name: "get_available_lessons",
      description:
        "Lists the classes given by the club's teachers that are open for enrollment: teacher, price, capacity and available spots, start/end dates and weekly schedule (day, time, court). isEnrolled marks the ones the customer is enrolled in and isOwn the ones they teach",
      inputSchema: getAvailableLessonsInputSchema,
      execute: async (input) => {
        const [bookerRow, lessons] = await Promise.all([
          getBookerByPhoneNumber(env, input.phoneNumber),
          getOpenLessons(env, nowInClubTime()),
        ]);

        return lessons.map((row) => toLessonItem(row, bookerRow?.id ?? null));
      },
    },
    {
      name: "get_my_lessons",
      description: "Lists the open classes the customer is enrolled in as a student",
      inputSchema: getMyLessonsInputSchema,
      execute: async (input) => {
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);

        if (!bookerRow) return [];

        const lessons = await getOpenLessons(env, nowInClubTime());

        return lessons
          .filter((row) => row.studentIds.includes(bookerRow.id))
          .map((row) => toLessonItem(row, bookerRow.id));
      },
    },
    {
      name: "enroll_in_lesson",
      description:
        "Enrolls the customer in a class as a student. Only players with an account on the club's website can enroll; the class must be active, not finished and have available spots, and teachers cannot enroll in their own class",
      inputSchema: enrollInLessonInputSchema,
      execute: async (input) => {
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);

        // En la web los alumnos son jugadores con cuenta: un booker sin cuenta no puede inscribirse.
        if (!bookerRow || bookerRow.type !== BookerType.PLAYER) {
          throw new Error("Only players with an account on the club's website can enroll in classes");
        }

        const error = await enrollInLesson(env, input.lessonId, bookerRow.id, nowInClubTime());

        if (error) throw new Error(error);

        return { lessonId: input.lessonId, enrolled: true };
      },
    },
    {
      name: "leave_lesson",
      description: "Removes the customer from a class they are enrolled in, without penalty",
      inputSchema: leaveLessonInputSchema,
      execute: async (input) => {
        const bookerRow = await getBookerByPhoneNumber(env, input.phoneNumber);
        const removed = bookerRow ? await unenrollFromLesson(env, input.lessonId, bookerRow.id) : false;

        if (!removed) throw new Error("You are not enrolled in this class");

        return { lessonId: input.lessonId, left: true };
      },
    },
  ];
}
