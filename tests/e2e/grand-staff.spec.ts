import { expect, test, type Page } from "@playwright/test";
import { createEmptyScore, createNoteEvent, type Part, type Score } from "../../src/domain/score";
import { openMode } from "./editor-modes";
import { storedScore } from "./storage";

async function seed(page: Page, score: Score) {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  await page.evaluate(async (score) => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      const tx = db.transaction("scores", "readwrite");
      tx.objectStore("scores").put({ id: score.id, updatedAt: score.updatedAt, revision: 1, json: JSON.stringify(score) });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
  }, score);
}

/** One measure: C4 and G5 (treble staff), E2 and B3 (bass staff). */
function score(id: string, instrument: Part["instrument"]): Score {
  const base = createEmptyScore({ id, title: "큰보표", measureCount: 1, createdAt: "2026-11-15T00:00:00.000Z" });
  const events = [
    createNoteEvent({ id: "c4", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "e2", step: "E", octave: 2, startTick: 960, durationTicks: 960 }),
    createNoteEvent({ id: "g5", step: "G", octave: 5, startTick: 1920, durationTicks: 960 }),
    createNoteEvent({ id: "b3", step: "B", octave: 3, startTick: 2880, durationTicks: 960 }),
  ];
  return { ...base, parts: [{ ...base.parts[0], instrument, measures: [{ ...base.parts[0].measures[0], events }] }] };
}

const centreY = (page: Page, id: string) => page.getByTestId("editor-content").getByTestId("staff").locator(`[data-event-id="${id}"]`)
  .evaluate((element) => { const box = element.getBoundingClientRect(); return box.top + box.height / 2; });
const staffHeight = (page: Page) => page.getByTestId("editor-content").getByTestId("staff").locator("svg")
  .evaluate((svg) => svg.getBoundingClientRect().height);

test("25현 가야금 악보는 큰보표: 가온 도 이상은 위, 아래는 아래 보표에 그리고, 음 선택·저장은 그대로다", async ({ page }) => {
  await seed(page, score("e2e-grand-25", "gayageum-25"));
  await page.goto("/editor/e2e-grand-25");
  const staff = page.getByTestId("editor-content").getByTestId("staff");
  await expect(staff.locator("[data-event-id]")).toHaveCount(4);
  // B3 (bass staff) sits clearly lower than C4 (treble staff): a semitone apart, but on different staves.
  const [c4, e2, g5, b3] = [await centreY(page, "c4"), await centreY(page, "e2"), await centreY(page, "g5"), await centreY(page, "b3")];
  expect(g5).toBeLessThan(c4);
  expect(e2).toBeGreaterThan(b3);
  const grandGap = b3 - c4;
  const grandHeight = await staffHeight(page);

  // A note on the bass staff is still the same event: tapping it opens its editor, and nothing was written.
  const before = await storedScore(page, "e2e-grand-25");
  await staff.locator('[data-event-id="e2"]').click();
  await expect(page.getByRole("tab", { name: "다듬기", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("E2 ·", { exact: false }).first()).toBeVisible();
  expect(await storedScore(page, "e2e-grand-25")).toEqual(before);

  // The same notes for the piano stay on one staff, which is shorter.
  await seed(page, score("e2e-grand-piano", "piano"));
  await page.goto("/editor/e2e-grand-piano");
  await expect(page.getByTestId("editor-content").getByTestId("staff").locator("[data-event-id]")).toHaveCount(4);
  expect(await staffHeight(page)).toBeLessThan(grandHeight - 50);
  // On one staff B3 is just a step below C4; on the grand staff the gap between the staves is added.
  const pianoGap = (await centreY(page, "b3")) - (await centreY(page, "c4"));
  expect(grandGap).toBeGreaterThan(pianoGap + 20);
});

test("25현 큰보표는 인쇄 화면에서도 한 줄(행) 안에 두 보표가 함께 나온다", async ({ page }) => {
  await seed(page, score("e2e-grand-print", "gayageum-25"));
  await page.goto("/print/e2e-grand-print");
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  const row = page.locator(".print-row svg").first();
  const ys = await row.evaluate((svg) => ["c4", "e2"].map((id) => {
    const box = svg.querySelector(`[data-event-id="${id}"]`)!.getBoundingClientRect(); return box.top;
  }));
  const box = await row.evaluate((svg) => { const rect = svg.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; });
  for (const y of ys) { expect(y).toBeGreaterThanOrEqual(box.top); expect(y).toBeLessThanOrEqual(box.bottom); }
  expect(ys[1]).toBeGreaterThan(ys[0]);
});

test("편집 커서는 큰보표의 두 보표에 걸쳐 그린다", async ({ page }) => {
  await seed(page, score("e2e-grand-cursor", "gayageum-25"));
  await page.goto("/editor/e2e-grand-cursor");
  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  const line = page.getByTestId("staff-edit-cursor");
  await expect(line).toHaveCount(1);
  const span = await line.evaluate((element) => Number(element.getAttribute("y2")) - Number(element.getAttribute("y1")));
  expect(span).toBe(175);
});

// UAT 2026-11-15: drawn before the music font was ready, stems and ledger lines stood away from their noteheads.
test("처음 열 때부터 음표 기둥이 머리에 붙어 그려진다(악보 글꼴을 기다린 뒤 그림): 피아노와 25현 모두", async ({ page }) => {
  for (const instrument of ["piano", "gayageum-25"] as const) {
    const id = `e2e-stem-${instrument}`;
    await seed(page, score(id, instrument));
    await page.goto(`/editor/${id}`);
    const glyphs = page.getByTestId("editor-content").getByTestId("staff").locator("[data-event-id]");
    await expect(glyphs).toHaveCount(4);
    const gaps = await glyphs.evaluateAll((elements) => elements.map((element) => {
      // The glyph itself: VexFlow also draws a note's annotations ("누름", labels) inside the notehead group.
      const head = (element.querySelector(".vf-notehead > text") as SVGGraphicsElement).getBBox();
      const stem = (element.querySelector(".vf-stem") as SVGGraphicsElement).getBBox();
      // Stem up: at the head's right edge; stem down: at its left edge.
      return Math.min(Math.abs(stem.x - head.x), Math.abs(stem.x - (head.x + head.width)));
    }));
    for (const gap of gaps) expect(gap).toBeLessThan(3);
  }
});
