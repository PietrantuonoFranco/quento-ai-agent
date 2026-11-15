import { pgTable, pgEnum, serial, integer, boolean, timestamp, numeric, time, unique } from "drizzle-orm/pg-core";

import { booker } from "./bookerSchema";
import { court } from "./courtSchema";
import DayOfWeek from "../../lib/enums/dayOfWeek";


// La web le da a lesson_schedules un enum propio, aunque tiene los mismos valores que el de schedules.
export const lessonScheduleDayOfWeekEnum = pgEnum("lesson_schedules_day_of_week_enum", DayOfWeek);

// Clase que da un jugador (el profesor, teacher_id -> bookers). Cada fecha de sus horarios
// semanales es un turno (bookings.lesson_id) a nombre del profesor; los alumnos inscriptos
// van a todos. Las fechas son hora de pared del club; to_local_datetime null = sin fecha de fin.
export const lesson = pgTable("lessons", {
  id: serial("id").primaryKey(),

  teacherId: integer("teacher_id").notNull().references(() => booker.id, { onDelete: "cascade" }),

  classCapacity: integer("class_capacity").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
  fromLocalDatetime: timestamp("from_local_datetime", { mode: 'date' }).notNull(),
  toLocalDatetime: timestamp("to_local_datetime", { mode: 'date' }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

// Horario semanal de una clase: en qué cancha, qué día y de qué hora a qué hora.
export const lessonSchedule = pgTable("lesson_schedules", {
  id: serial("id").primaryKey(),

  lessonId: integer("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
  courtId: integer("court_id").notNull().references(() => court.id),

  dayOfWeek: lessonScheduleDayOfWeekEnum("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
}, (table) => [
  unique("UQ_lesson_schedules_lesson_day_start").on(table.lessonId, table.dayOfWeek, table.startTime),
]);

// Alumno (un jugador con cuenta) inscripto en una clase.
export const inscription = pgTable("inscriptions", {
  id: serial("id").primaryKey(),

  lessonId: integer("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => booker.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  unique("UQ_inscriptions_lesson_player").on(table.lessonId, table.playerId),
]);
