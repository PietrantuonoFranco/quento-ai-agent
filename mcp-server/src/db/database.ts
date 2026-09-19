import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schemas";
import type Env from "../lib/interfaces/EnvInterface";

export function getDb(env: Env) {
  const client = postgres(env.DB.connectionString, {
    prepare: false, // requerido por Hyperdrive
    max: 1,
    idle_timeout: 5, // getDb crea un cliente por llamada: sin esto las conexiones quedan abiertas y se agotan
  });

  return drizzle(client, { schema });
}