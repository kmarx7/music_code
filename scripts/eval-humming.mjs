#!/usr/bin/env node
// `npm run eval:humming -- <folder>`: passes the folder to the eval run as HUMMING_DIR (P6-08).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const init = args.includes("--init");
const folder = args.find((arg) => arg !== "--init");
if (!folder) {
  console.error("사용법: npm run eval:humming -- [--init] <녹음 폴더(저장소 밖)>");
  process.exit(2);
}
const run = spawnSync("npx", ["vitest", "run", "--config", "vitest.eval.config.ts"], {
  stdio: "inherit", env: { ...process.env, HUMMING_DIR: resolve(folder), HUMMING_INIT: init ? "1" : "0" },
});
process.exit(run.status ?? 1);
