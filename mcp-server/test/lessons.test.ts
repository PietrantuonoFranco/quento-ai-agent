import { describe, expect, it } from "vitest";

import { enrollmentError, isLessonOpen } from "../src/lib/lessons";
import { at, TODAY, TOMORROW } from "./helpers";

const now = at(TODAY, "09:00");

// Clase activa del profesor 7, con cupo 4 y sin fecha de fin.
const lesson = (overrides: Record<string, unknown> = {}) => ({
  teacherId: 7,
  isActive: true,
  toLocalDatetime: null as Date | null,
  classCapacity: 4,
  ...overrides,
});

describe("isLessonOpen", () => {
  it("está abierta si está activa y no tiene fecha de fin", () => {
    expect(isLessonOpen(lesson(), now)).toBe(true);
  });

  it("está abierta si su fin todavía no llegó", () => {
    expect(isLessonOpen(lesson({ toLocalDatetime: at(TOMORROW, "23:59") }), now)).toBe(true);
  });

  it("no está abierta si ya terminó", () => {
    expect(isLessonOpen(lesson({ toLocalDatetime: at(TODAY, "09:00") }), now)).toBe(false);
  });

  it("no está abierta si fue dada de baja", () => {
    expect(isLessonOpen(lesson({ isActive: false }), now)).toBe(false);
  });
});

describe("enrollmentError", () => {
  it("deja inscribirse en una clase abierta con cupo", () => {
    expect(enrollmentError(lesson(), [1, 2], 5, now)).toBeNull();
  });

  it("rechaza una clase dada de baja", () => {
    expect(enrollmentError(lesson({ isActive: false }), [], 5, now)).toBe("The class was cancelled");
  });

  it("rechaza una clase que ya terminó", () => {
    expect(enrollmentError(lesson({ toLocalDatetime: at(TODAY, "08:00") }), [], 5, now)).toBe(
      "The class has already finished",
    );
  });

  it("el profesor no puede ser alumno de su propia clase", () => {
    expect(enrollmentError(lesson(), [], 7, now)).toBe("The teacher cannot enroll in their own class");
  });

  it("rechaza a quien ya está inscripto", () => {
    expect(enrollmentError(lesson(), [5], 5, now)).toBe("You are already enrolled in this class");
  });

  it("rechaza si la clase está completa", () => {
    expect(enrollmentError(lesson(), [1, 2, 3, 4], 5, now)).toBe("The class is full");
  });
});
