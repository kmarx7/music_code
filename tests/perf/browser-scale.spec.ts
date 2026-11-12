import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { createEmptyScore, createNoteEvent, serializeScore, validateScore } from "../../src/domain/score";
import type { Part, Score, TieLink } from "../../src/domain/score";

/**
 * H-03: browser-side measurement of large scores (not a pass/fail gate, no thresholds asserted).
 * Synthetic data mirroring the Phase 2 audit fixtures: C4/D4/E4/G4 quarters per 4/4 measure.
 * `tied` links each measure's last G4 to a G4 at the next downbeat (255 two-segment chains).
 */
const BAR = 3840;
const SAMPLES = Number(process.env.PERF_SAMPLES ?? 5);
const THROTTLES = [1, 4];
const OUT_DIR = process.env.PERF_OUT ?? join("test-results", "perf");

interface Fixture { name: string; measures: number; parts: number; tied: boolean }
const FIXTURES: Fixture[] = [
  { name: "small", measures: 8, parts: 1, tied: false },
  { name: "medium", measures: 64, parts: 1, tied: false },
  { name: "large", measures: 256, parts: 1, tied: false },
  { name: "multi", measures: 64, parts: 4, tied: false },
  { name: "tied", measures: 256, parts: 1, tied: true },
];

function buildScore({ name, measures, parts, tied }: Fixture): Score {
  const score = createEmptyScore({ id: `perf-${name}`, title: `perf-${name}`, measureCount: measures, createdAt: "2026-11-12T00:00:00.000Z" });
  const first = score.parts[0];
  const steps = ["C", "D", "E", "G"] as const;
  const makePart = (partIndex: number): Part => {
    const ties: TieLink[] = [];
    const filled = first.measures.map((measure, m) => ({
      ...measure,
      id: `p${partIndex}-m${m}`,
      events: steps.map((step, beat) => createNoteEvent({
        id: `p${partIndex}-m${m}-n${beat}`, step: tied && beat === 0 && m > 0 ? "G" : step, octave: 4,
        startTick: m * BAR + beat * 960, durationTicks: 960,
      })),
    }));
    if (tied) for (let m = 1; m < measures; m += 1) ties.push({ from: `p${partIndex}-m${m - 1}-n3`, to: `p${partIndex}-m${m}-n0` });
    return { ...first, id: partIndex === 0 ? first.id : `perf-part-${partIndex}`, name: `Part ${partIndex + 1}`, ties, measures: filled };
  };
  const built = { ...score, parts: Array.from({ length: parts }, (_, index) => makePart(index)) };
  const issues = validateScore(built);
  if (issues.length) throw new Error(`fixture ${name} invalid: ${JSON.stringify(issues.slice(0, 3))}`);
  return built;
}

interface Probe {
  wallMs: number; eventMs: number; longTaskMaxMs: number; longTaskSumMs: number; longTasks: number; timerLagMaxMs: number;
  /** Main-thread time split from CDP Performance metrics: long tasks do not count style/layout work done outside a task. */
  scriptMs: number; styleMs: number; layoutMs: number; taskMs: number;
}

let metricsCdp: CDPSession | null = null;
async function mainThreadMs() {
  const { metrics } = await metricsCdp!.send("Performance.getMetrics");
  const ms = (name: string) => (metrics.find((metric) => metric.name === name)?.value ?? 0) * 1000;
  return { scriptMs: ms("ScriptDuration"), styleMs: ms("RecalcStyleDuration"), layoutMs: ms("LayoutDuration"), taskMs: ms("TaskDuration") };
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const state = { long: [] as number[], events: [] as number[], lag: 0, last: 0, timer: 0 as unknown as number };
    const longObserver = new PerformanceObserver((list) => { for (const entry of list.getEntries()) state.long.push(entry.duration); });
    longObserver.observe({ type: "longtask", buffered: false });
    const eventObserver = new PerformanceObserver((list) => { for (const entry of list.getEntries()) state.events.push(entry.duration); });
    eventObserver.observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    Object.assign(window, {
      __perfBegin() {
        longObserver.takeRecords(); eventObserver.takeRecords();
        state.long = []; state.events = []; state.lag = 0; state.last = performance.now();
        clearInterval(state.timer);
        state.timer = window.setInterval(() => {
          const now = performance.now(); state.lag = Math.max(state.lag, now - state.last - 20); state.last = now;
        }, 20);
      },
      async __perfEnd() {
        await new Promise((resolve) => setTimeout(resolve, 150)); // let event-timing / longtask entries flush
        for (const entry of longObserver.takeRecords()) state.long.push(entry.duration);
        for (const entry of eventObserver.takeRecords()) state.events.push(entry.duration);
        clearInterval(state.timer);
        return {
          eventMs: Math.max(0, ...state.events), longTaskMaxMs: Math.max(0, ...state.long),
          longTaskSumMs: state.long.reduce((sum, value) => sum + value, 0), longTasks: state.long.length, timerLagMaxMs: Math.max(0, state.lag),
        };
      },
    });
  });
}

/** Runs `act`, waits for `done`, and returns wall time (includes Playwright IPC) plus in-page probes. */
async function probe(page: Page, act: () => Promise<unknown>, done: () => Promise<unknown>): Promise<Probe> {
  await page.evaluate(() => (window as unknown as { __perfBegin(): void }).__perfBegin());
  const before = await mainThreadMs();
  const start = Date.now();
  await act(); await done();
  const wallMs = Date.now() - start;
  const rest = await page.evaluate(() => (window as unknown as { __perfEnd(): Promise<Omit<Probe, "wallMs">> }).__perfEnd());
  const after = await mainThreadMs();
  return {
    wallMs, ...rest, scriptMs: after.scriptMs - before.scriptMs, styleMs: after.styleMs - before.styleMs,
    layoutMs: after.layoutMs - before.layoutMs, taskMs: after.taskMs - before.taskMs,
  };
}

async function heapMb(cdp: CDPSession) {
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  return Number((usedSize / 1024 / 1024).toFixed(1));
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (value: number) => Number(value.toFixed(1));
  return { median: round(sorted[Math.floor(sorted.length / 2)]), min: round(sorted[0]), max: round(sorted[sorted.length - 1]), samples: sorted.length };
};
const summarize = <K extends string>(probes: Record<K, number>[]) => Object.fromEntries((Object.keys(probes[0]) as K[])
  .map((key) => [key, stats(probes.map((item) => item[key]))]));

const results: Record<string, unknown>[] = [];

test.afterAll(async ({ browser }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, "h03-browser-scale.json");
  writeFileSync(file, JSON.stringify({
    takenAt: new Date().toISOString(), browser: `${browser.browserType().name()} ${browser.version()}`,
    node: process.version, platform: `${process.platform} ${process.arch}`, samples: SAMPLES, throttles: THROTTLES, results,
  }, null, 2));
  console.log(`H-03 results written to ${file}`);
});

for (const fixture of FIXTURES) {
  test(`H-03 측정: ${fixture.name} (${fixture.measures}마디 × ${fixture.parts}Part${fixture.tied ? ", 타이 다수" : ""})`, async ({ page }) => {
    const score = buildScore(fixture);
    const json = serializeScore(score);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    metricsCdp = cdp;
    await installProbe(page);

    // Import through the real library flow, then open the only score in this fresh profile.
    await page.goto("/library");
    await page.locator("#score-import").setInputFiles({ name: `${fixture.name}.json`, mimeType: "application/json", buffer: Buffer.from(json) });
    await expect(page.getByText("새 악보로 가져왔습니다", { exact: false })).toBeVisible();
    const href = await page.getByRole("link", { name: "열기", exact: true }).first().getAttribute("href");
    if (!href) throw new Error("imported score link missing");

    const content = page.getByTestId("editor-content");
    const staff = content.getByTestId("staff");
    const staffEvents = staff.locator("[data-event-id]");
    const firstPartEvents = fixture.measures * 4;
    // Labels are drawn once per sounding note: a tied continuation segment has no label of its own.
    const firstPartLabels = firstPartEvents - (fixture.tied ? fixture.measures - 1 : 0);

    for (const rate of THROTTLES) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      const row: Record<string, unknown> = {
        fixture: fixture.name, measures: fixture.measures, parts: fixture.parts,
        notes: fixture.measures * 4 * fixture.parts, ties: fixture.tied ? fixture.measures - 1 : 0, jsonBytes: Buffer.byteLength(json), cpuThrottle: rate,
      };

      // 1. Open: navigation until every first-Part event is drawn on the staff.
      const opens: Omit<Probe, "scriptMs" | "styleMs" | "layoutMs" | "taskMs">[] = []; // a navigation resets the CDP counters
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        await page.goto("about:blank");
        const start = Date.now();
        await page.goto(href);
        await expect(staffEvents).toHaveCount(firstPartEvents);
        const wallMs = Date.now() - start;
        // The probe's observer has been collecting long tasks since the document started loading.
        const { longTaskMaxMs, longTaskSumMs, longTasks } = await page.evaluate(() =>
          (window as unknown as { __perfEnd(): Promise<Omit<Probe, "wallMs">> }).__perfEnd());
        const rest = { longTaskMaxMs, longTaskSumMs, longTasks };
        opens.push({ wallMs, eventMs: 0, timerLagMaxMs: 0, ...rest });
      }
      row.open = summarize(opens);
      row.dom = await page.evaluate(() => ({
        staffNodes: document.querySelector('[data-testid="staff"]')?.querySelectorAll("*").length ?? 0,
        documentNodes: document.querySelectorAll("*").length,
      }));
      row.heapMbAfterOpen = await heapMb(cdp);

      // 2. Display-only interaction: note labels redraw the whole staff.
      const labels: Probe[] = [];
      // Probed actions use element handles resolved beforehand: a role/label locator computes accessible names
      // for the whole page inside the probe window (≈115 ms on 256 measures), which is harness cost, not app cost.
      const handle = async (locator: Locator) => (await locator.elementHandle())!;
      const labelSelect = page.getByLabel("악보 라벨", { exact: true });
      const labelHandle = await handle(labelSelect);
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        labels.push(await probe(page, () => labelHandle.selectOption("letter"),
          () => expect(staff.getByTestId("note-label")).toHaveCount(firstPartLabels)));
        await labelSelect.selectOption("none");
        await expect(staff.getByTestId("note-label")).toHaveCount(0);
      }
      row.labelToggle = summarize(labels);

      // 3. Edit command: add a measure (command + validation + redraw), then Undo.
      const edits: Probe[] = [];
      const undos: Probe[] = [];
      const summary = page.getByTestId("score-summary");
      const addHandle = await handle(page.getByRole("button", { name: "마디 추가", exact: true }));
      const undoHandle = await handle(page.getByRole("button", { name: "Undo", exact: true }));
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        const before = await summary.textContent();
        edits.push(await probe(page, () => addHandle.click(),
          () => expect(summary).not.toHaveText(before ?? "")));
        undos.push(await probe(page, () => undoHandle.click(),
          () => expect(summary).toHaveText(before ?? "")));
      }
      row.addMeasure = summarize(edits);
      row.undo = summarize(undos);
      await expect(page.getByText("저장됨", { exact: true }).first()).toBeVisible();

      // 4. Range recommendation (synchronous on the main thread): wide target, narrow target, double click.
      await page.getByRole("button", { name: "조옮김", exact: true }).click();
      const low = page.getByLabel("목표 최저 MIDI", { exact: true });
      const high = page.getByLabel("목표 최고 MIDI", { exact: true });
      const calc = page.getByRole("button", { name: "추천 계산", exact: true });
      const recSummary = page.getByTestId("range-recommendation-summary");
      const calcHandle = await handle(calc);
      const recommend = async (min: number, max: number, clicks: number) => {
        const probes: Probe[] = [];
        for (let sample = 0; sample < SAMPLES; sample += 1) {
          await low.fill(""); // clearing first guarantees a change event, which invalidates the previous result
          await low.fill(String(min)); await high.fill(String(max));
          await expect(recSummary).toHaveCount(0);
          probes.push(await probe(page, () => calcHandle.click({ clickCount: clicks }), () => expect(recSummary).toBeVisible()));
        }
        return summarize(probes);
      };
      row.recommendWide = await recommend(62, 74, 1);
      row.recommendNarrow = await recommend(60, 62, 1);
      row.recommendDoubleClick = await recommend(62, 74, 2);
      row.candidates = await page.getByTestId("range-candidate").count();
      row.heapMbAfterRecommend = await heapMb(cdp);
      await page.getByTestId("transpose-preview").getByRole("button", { name: "취소", exact: true }).click();

      results.push(row);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });
}
