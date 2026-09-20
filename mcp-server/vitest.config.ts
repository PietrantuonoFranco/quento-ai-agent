import { defineConfig } from "vitest/config";

// Tests unitarios en Node: las queries se mockean, no hace falta base de datos ni el runtime de workerd.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
