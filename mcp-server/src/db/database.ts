import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schemas";
import type Env from "../lib/interfaces/EnvInterface";

export function getDb(env: Env) {
  const client = postgres(env.DB.connectionString, {
    prepare: false, // requerido por Hyperdrive
  });

  return drizzle(client, { schema });
}