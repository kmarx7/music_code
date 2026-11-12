import { defineConfig, devices } from "@playwright/test";

const PORT = 3010;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * H-03 browser measurement only. Not part of `npm run test:e2e` and never a pass/fail gate:
 * run with `npm run perf:browser`. Results are written to PERF_OUT (default test-results/perf).
 */
export default defineConfig({
  testDir: "./tests/perf",
  timeout: 900_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
