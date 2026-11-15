import { getDb } from "../database";
import { booker, penalty } from "../schemas";
import { eq, sql } from "drizzle-orm";
import type Env from "../../lib/interfaces/EnvInterface";
import { penaltyAmount } from "../../lib/penalties";

// Registra una penalización de `points` puntos, como recordPointsMovement de la web:
// el saldo es la suma de los movimientos y nunca baja de 0, así que solo se descuenta
// lo que el jugador tiene (sin saldo se registra igual, por 0). Actualiza también
// bookers.scoring. Devuelve el monto registrado (0 o negativo).
export async function recordPenalty(env: Env, playerId: number, points: number, reason: string) {
  const db = getDb(env);

  return db.transaction(async (tx) => {
    // Serializa los movimientos del jugador para que dos penalizaciones a la vez no lean el mismo saldo.
    await tx.select({ id: booker.id }).from(booker).where(eq(booker.id, playerId)).for("update");

    const [{ balance }] = await tx
      .select({ balance: sql<number>`coalesce(sum(${penalty.penalizedScoring}), 0)`.mapWith(Number) })
      .from(penalty)
      .where(eq(penalty.playerId, playerId));
    const amount = penaltyAmount(balance, points);

    await tx.insert(penalty).values({ playerId, penalizedScoring: amount, reason });
    await tx.update(booker).set({ scoring: balance + amount }).where(eq(booker.id, playerId));

    return amount;
  });
}
