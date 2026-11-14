import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/queries/bookerQueries");
vi.mock("../src/db/queries/lessonQueries");

import * as bookerQueries from "../src/db/queries/bookerQueries";
import * as lessonQueries from "../src/db/queries/lessonQueries";
import { getLessonTools } from "../src/tools/lessonTools";
import { NOW_UTC, TODAY, at, callTool, env } from "./helpers";

const tools = getLessonTools(env);
const call = (name: string, args: Record<string, unknown> = {}) => callTool(tools, name, args);
const q = vi.mocked;

const phone = { phoneNumber: "5491111" };

// Clase 3 del profesor 7: martes y jueves 19:30 en la cancha 2, cupo 4, con el alumno 1 inscripto.
const lessonRow = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  teacherId: 7,
  teacherNames: "Ana",
  teacherLastNames: "Gómez",
  classCapacity: 4,
  price: "15000.00",
  isActive: true,
  fromLocalDatetime: at("2026-09-01", "00:00"),
  toLocalDatetime: null,
  schedules: [
    { courtId: 2, courtNumber: 2, dayOfWeek: "thursday", startTime: "19:30:00", endTime: "21:00:00" },
    { courtId: 2, courtNumber: 2, dayOfWeek: "tuesday", startTime: "19:30:00", endTime: "21:00:00" },
  ],
  studentIds: [1],
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW_UTC));

  q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Player" } as any);
  q(lessonQueries.getOpenLessons).mockResolvedValue([lessonRow()] as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("get_available_lessons", () => {
  it("lista las clases abiertas con profesor, precio, cupo y horarios ordenados", async () => {
    const result = await call("get_available_lessons", phone);

    expect(lessonQueries.getOpenLessons).toHaveBeenCalledWith(env, at(TODAY, "09:00"));
    expect(result).toEqual([
      {
        lessonId: 3,
        teacherName: "Ana Gómez",
        price: 15000,
        classCapacity: 4,
        studentsCount: 1,
        availableSpots: 3,
        fromDate: "2026-09-01",
        toDate: null,
        schedules: [
          { courtNumber: 2, dayOfWeek: "tuesday", startTime: "19:30", endTime: "21:00" },
          { courtNumber: 2, dayOfWeek: "thursday", startTime: "19:30", endTime: "21:00" },
        ],
        isEnrolled: false,
        isOwn: false,
      },
    ]);
  });

  it("marca las clases en las que está inscripto y las que da como profesor", async () => {
    q(lessonQueries.getOpenLessons).mockResolvedValue([
      lessonRow({ id: 3, studentIds: [5] }),
      lessonRow({ id: 4, teacherId: 5 }),
    ] as any);

    const result = await call("get_available_lessons", phone);

    expect(result.map((l: any) => [l.lessonId, l.isEnrolled, l.isOwn])).toEqual([
      [3, true, false],
      [4, false, true],
    ]);
  });

  it("no expone quiénes son los alumnos", async () => {
    const [lesson] = await call("get_available_lessons", phone);

    expect(lesson).not.toHaveProperty("studentIds");
  });

  it("funciona aunque el teléfono no esté registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    const [lesson] = await call("get_available_lessons", phone);

    expect(lesson).toMatchObject({ isEnrolled: false, isOwn: false });
  });

  it("informa la fecha de fin si la clase tiene una", async () => {
    q(lessonQueries.getOpenLessons).mockResolvedValue([lessonRow({ toLocalDatetime: at("2026-12-15", "23:59") })] as any);

    const [lesson] = await call("get_available_lessons", phone);

    expect(lesson.toDate).toBe("2026-12-15");
  });
});

describe("get_my_lessons", () => {
  it("lista solo las clases en las que está inscripto", async () => {
    q(lessonQueries.getOpenLessons).mockResolvedValue([
      lessonRow({ id: 3, studentIds: [5] }),
      lessonRow({ id: 4, studentIds: [1] }),
    ] as any);

    const result = await call("get_my_lessons", phone);

    expect(result.map((l: any) => l.lessonId)).toEqual([3]);
  });

  it("devuelve una lista vacía si el teléfono no está registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    expect(await call("get_my_lessons", phone)).toEqual([]);
  });
});

describe("enroll_in_lesson", () => {
  const input = { ...phone, lessonId: 3 };

  beforeEach(() => {
    q(lessonQueries.enrollInLesson).mockResolvedValue(null);
  });

  it("inscribe al jugador del teléfono", async () => {
    const result = await call("enroll_in_lesson", input);

    expect(lessonQueries.enrollInLesson).toHaveBeenCalledWith(env, 3, 5, at(TODAY, "09:00"));
    expect(result).toEqual({ lessonId: 3, enrolled: true });
  });

  it("falla con el motivo que devuelve la inscripción", async () => {
    q(lessonQueries.enrollInLesson).mockResolvedValue("The class is full");

    await expect(call("enroll_in_lesson", input)).rejects.toThrow("The class is full");
  });

  it("falla si el teléfono no está registrado", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue(null as any);

    await expect(call("enroll_in_lesson", input)).rejects.toThrow("account");
    expect(lessonQueries.enrollInLesson).not.toHaveBeenCalled();
  });

  it("solo se inscriben jugadores con cuenta", async () => {
    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValue({ id: 5, type: "Booker" } as any);

    await expect(call("enroll_in_lesson", input)).rejects.toThrow("account");
    expect(lessonQueries.enrollInLesson).not.toHaveBeenCalled();
  });

  it("exige un id de clase positivo", async () => {
    await expect(call("enroll_in_lesson", { ...phone, lessonId: 0 })).rejects.toThrow();
  });
});

describe("leave_lesson", () => {
  const input = { ...phone, lessonId: 3 };

  it("da de baja al jugador del teléfono", async () => {
    q(lessonQueries.unenrollFromLesson).mockResolvedValue(true);

    const result = await call("leave_lesson", input);

    expect(lessonQueries.unenrollFromLesson).toHaveBeenCalledWith(env, 3, 5);
    expect(result).toEqual({ lessonId: 3, left: true });
  });

  it("usa el mismo error si no estaba inscripto o el teléfono no está registrado", async () => {
    q(lessonQueries.unenrollFromLesson).mockResolvedValueOnce(false);
    const notEnrolled = await call("leave_lesson", input).catch((e) => e.message);

    q(bookerQueries.getBookerByPhoneNumber).mockResolvedValueOnce(null as any);
    const unregistered = await call("leave_lesson", input).catch((e) => e.message);

    expect(notEnrolled).toBe("You are not enrolled in this class");
    expect(unregistered).toBe(notEnrolled);
  });
});
