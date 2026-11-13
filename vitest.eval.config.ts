import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Real-humming evaluation only (`npm run eval:humming -- <folder>`, P6-08). Not part of `npm run test`.
 * Reads recordings from HUMMING_DIR (outside the repository) and writes the report there.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    testTimeout: 900_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
