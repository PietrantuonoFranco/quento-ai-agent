import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();


export default defineConfig({
  schema: "./src/db/schemas/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false }
  },
  verbose: true,
  strict: true,
});