import { describe, expect, it } from "vitest";

import { isLateCancellation, penaltyAmount } from "../src/lib/penalties";
import { at, TODAY } from "./helpers";

// Ahora: 09:00 (hora de pared del club). El umbral es de 3 horas: 12:00.
const now = at(TODAY, "09:00");

describe("isLateCancellation", () => {
  it("es tardía si faltan menos de 3 horas para el turno", () => {
    expect(isLateCancellation(at(TODAY, "11:59"), now)).toBe(true);
  });

  it("no es tardía si faltan exactamente 3 horas", () => {
    expect(isLateCancellation(at(TODAY, "12:00"), now)).toBe(false);
  });

  it("no es tardía si faltan más de 3 horas", () => {
    expect(isLateCancellation(at(TODAY, "15:00"), now)).toBe(false);
  });

  it("es tardía si el turno ya empezó", () => {
    expect(isLateCancellation(at(TODAY, "08:00"), now)).toBe(true);
  });
});

describe("penaltyAmount", () => {
  it("descuenta los puntos completos si el saldo alcanza", () => {
    expect(penaltyAmount(50, 20)).toBe(-20);
  });

  it("solo descuenta lo que el jugador tiene, para no bajar de 0", () => {
    expect(penaltyAmount(5, 20)).toBe(-5);
  });

  it("descuenta 0 si no tiene saldo (la falta igual queda registrada)", () => {
    expect(penaltyAmount(0, 20)).toBe(0);
    expect(penaltyAmount(-3, 20)).toBe(0);
  });
});
