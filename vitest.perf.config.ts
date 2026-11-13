import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Node-side measurements only (`npm run perf:pitch`). Not part of `npm run test` and never a pass/fail gate.
 * Results are written to PERF_OUT (default test-results/perf).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/perf/**/*.perf.ts"],
    testTimeout: 900_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
