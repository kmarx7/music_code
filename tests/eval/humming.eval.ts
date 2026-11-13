import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";
import { evaluateHummingFolder, formatHummingReport, writeHummingTemplates } from "./humming-eval";

/**
 * P6-08 runner. The verdict is reported, not asserted: a FAIL or INSUFFICIENT result is a finding to record in
 * TASKS/TEST_PLAN, not a broken build. The run fails only when the folder is missing or inside the repository.
 */
it("evaluates real humming takes against C-09", () => {
  const dir = process.env.HUMMING_DIR;
  if (!dir) throw new Error("Usage: npm run eval:humming -- <recordings folder>");
  const folder = resolve(dir);
  const inside = relative(process.cwd(), folder);
  // Recordings never live in the repo (decision 9), so they cannot be committed by accident.
  expect(inside.startsWith("..") || resolve(inside) === inside, `Recordings folder must be outside the repository: ${folder}`).toBe(true);

  if (process.env.HUMMING_INIT === "1") {
    const written = writeHummingTemplates(folder);
    process.stdout.write(`\n정답 템플릿 ${written.length}개를 만들었습니다: ${folder}\n`);
    return;
  }
  const result = evaluateHummingFolder(folder);
  let commit: string | undefined;
  try { commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { commit = undefined; }
  const generatedAt = new Date().toISOString();
  const reportPath = join(folder, `humming-report-${generatedAt.replace(/[:.]/g, "-")}.md`);
  writeFileSync(reportPath, formatHummingReport(result, { generatedAt, commit }));
  const { total } = result;
  process.stdout.write(`\n허밍 평가: ${result.verdict} · F1 ${total.f1.toFixed(3)} · 채점 ${result.scoredTakes}/${result.takes.length} · 보고서 ${reportPath}\n`);
});
