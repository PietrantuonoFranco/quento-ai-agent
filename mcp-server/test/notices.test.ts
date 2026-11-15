import { describe, expect, it } from "vitest";

import { classCancelledByTeacherNotice, matchCancelledByCreatorNotice } from "../src/lib/notices";
import { at } from "./helpers";

// Sábado 19/09 a las 19:30 (hora de pared del club) en la cancha 2.
const booking = { datetime: at("2026-09-19", "19:30"), courtNumber: 2 };

// Mismas plantillas (nombre y orden de parámetros) que la web: padel-quento/src/domain/notifications.ts.
describe("avisos", () => {
  it("partido cancelado por quien lo armó", () => {
    expect(matchCancelledByCreatorNotice("Ana", "Juan Pérez", booking)).toEqual({
      name: "quento_partido_cancelado",
      parameters: ["Ana", "Juan Pérez", "sábado 19 de septiembre", "19:30", "2"],
    });
  });

  it("clase cancelada por el profesor", () => {
    expect(classCancelledByTeacherNotice("Ana", "Juan Pérez", booking)).toEqual({
      name: "quento_clase_cancelada_profesor",
      parameters: ["Ana", "Juan Pérez", "sábado 19 de septiembre", "19:30", "2"],
    });
  });

  it("formatea la hora de pared del club sin depender de la zona horaria del servidor", () => {
    const early = { datetime: at("2026-09-20", "09:00"), courtNumber: 1 };

    expect(matchCancelledByCreatorNotice("Ana", "Juan", early).parameters.slice(2, 4)).toEqual([
      "domingo 20 de septiembre",
      "09:00",
    ]);
  });
});
