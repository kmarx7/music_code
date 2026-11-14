import { expect, test, type Page, type Locator } from "@playwright/test";
import { openMode } from "./editor-modes";
import { baseScore, withMeasureEvents } from "../fixtures/scores";
import { createNoteEvent, createRestEvent, type Score } from "../../src/domain/score";

async function record(page: Page, id: string, score?: Score) {
  return page.evaluate(async ({ id, score }) => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction("scores", score ? "readwrite" : "readonly");
      const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      const store = tx.objectStore("scores");
      const request = score ? store.put({ id, updatedAt: score.updatedAt, revision: 1, json: JSON.stringify(score) }) : store.get(id);
      const result = await new Promise<unknown>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await done; return result;
    } finally { db.close(); }
  }, { id, score });
}
async function seed(page: Page, durationTicks: number) {
  const score = withMeasureEvents(baseScore(), [
    createNoteEvent({ id: "exact-note", step: "C", octave: 4, startTick: 120, durationTicks }),
    ...(durationTicks === 300 ? [createNoteEvent({ id: "adjacent-note", step: "D", octave: 4, startTick: 480, durationTicks: 960 })] : []),
    createRestEvent({ id: "exact-rest", startTick: 1440, durationTicks: 300 }),
  ]);
  score.tempoBpm = 40;
  await page.goto("/library"); await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  await record(page, score.id, score); await page.goto(`/editor/${score.id}`);
  await expect(page.getByRole("heading", { name: score.title, exact: true })).toBeVisible(); return score;
}

async function selectFragment(page: Page, fragment: Locator, id: string, touch = false) {
  await fragment.scrollIntoViewIfNeeded();
  // Check both the group-click center and the original notehead-click center.
  // Another fragment's pointerRect must not cover either, even for the same ID.
  await expect.poll(() => fragment.evaluate((group) => {
    const head = group.querySelector(".vf-notehead");
    return !!head && [group, head].every((target) => {
      const box = target.getBoundingClientRect();
      const hit = group.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return !!hit && group.contains(hit) && hit.closest("[data-event-id]") === group;
    });
  })).toBe(true);
  // VexFlow draws a transparent pointerRect after the notehead. It is the
  // intended hit area, a child of this event group, not an unrelated overlay.
  if (touch) await fragment.tap(); else await fragment.click();
  await openMode(page, "다듬기");
  await expect(page.locator(`button[data-event-id="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`button[data-event-id][aria-pressed="true"]`)).toHaveCount(1);
}

test("300 ticks는 실제 점·타이 glyph와 원본 선택을 유지하고 표시만으로 저장되지 않는다", async ({ page, browser }) => {
  const score = await seed(page, 300); const staff = page.getByTestId("editor-content").getByTestId("staff");
  await openMode(page, "다듬기");
  const fragments = staff.locator('[data-event-id="exact-note"]');
  await expect(fragments).toHaveCount(2);
  await expect(fragments.nth(0)).toHaveAttribute("data-notation-duration", "180");
  await expect(fragments.nth(1)).toHaveAttribute("data-notation-duration", "120");
  await expect(fragments.nth(1)).toHaveAttribute("data-notation-start", "300");
  await expect(staff.locator(".vf-stavetie")).toHaveCount(1);
  // VexFlow 5 Dot.draw() writes augmentationDot (SMuFL U+E1E7) as SVG text,
  // inside the original note/rest's notehead, without a .vf-dot wrapper.
  const dotGlyph = /^\uE1E7$/;
  await expect(staff.locator("[data-event-id] .vf-notehead text").filter({ hasText: dotGlyph })).toHaveCount(2);
  await expect(fragments.locator(".vf-notehead text").filter({ hasText: dotGlyph })).toBeVisible();
  await expect(staff.locator('[data-event-id="exact-rest"] .vf-notehead text').filter({ hasText: dotGlyph })).toBeVisible();
  const positions = await fragments.evaluateAll((nodes) => nodes.map((node) => (node as SVGGraphicsElement).getBBox().x));
  expect(positions[1]).toBeGreaterThan(positions[0]);
  const original = await record(page, score.id);
  await openMode(page, "다듬기");
  const adjacent = staff.locator('[data-event-id="adjacent-note"]');
  const rests = staff.locator('[data-event-id="exact-rest"]');
  await selectFragment(page, fragments.nth(0), "exact-note");
  await selectFragment(page, adjacent, "adjacent-note");
  await selectFragment(page, fragments.nth(1), "exact-note");
  await openMode(page, "다듬기");
  await expect(page.locator('button[data-event-id="adjacent-note"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("C4 · 도 · 300 ticks", { exact: true })).toBeVisible();
  await selectFragment(page, rests.nth(0), "exact-rest");
  await selectFragment(page, rests.nth(1), "exact-rest");
  await selectFragment(page, fragments.nth(1), "exact-note");
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(staff.getByTestId("note-label")).toHaveText(["C4", "D4"]);
  await openMode(page, "다듬기");
  await expect(page.locator('button[data-event-id="exact-note"]')).toHaveAttribute("aria-pressed", "true");
  await selectFragment(page, adjacent, "adjacent-note");
  await selectFragment(page, fragments.nth(0), "exact-note");
  await selectFragment(page, fragments.nth(1), "exact-note");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(fragments).toHaveCount(2); await expect(adjacent).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(fragments).toHaveCount(2); await expect(adjacent).toHaveCount(1);
  expect(await record(page, score.id)).toEqual(original);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  await openMode(page, "다듬기");
  await page.reload(); await expect(fragments).toHaveCount(2);
  expect(await record(page, score.id)).toEqual(original);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const touchPage = await mobile.newPage(); const touchScore = await seed(touchPage, 300);
    const touchStaff = touchPage.getByTestId("editor-content").getByTestId("staff");
    await openMode(page, "다듬기");
    const touchFragments = touchStaff.locator('[data-event-id="exact-note"]');
    await expect(touchFragments).toHaveCount(2); const raw = await record(touchPage, touchScore.id);
    await selectFragment(touchPage, touchFragments.nth(0), "exact-note", true);
    await selectFragment(touchPage, touchStaff.locator('[data-event-id="adjacent-note"]'), "adjacent-note", true);
    await selectFragment(touchPage, touchFragments.nth(1), "exact-note", true);
    await selectFragment(touchPage, touchStaff.locator('[data-event-id="exact-rest"]').nth(1), "exact-rest", true);
    expect(await record(touchPage, touchScore.id)).toEqual(raw);
  } finally { await mobile.close(); }
});

test("1000 ticks는 명시적 오류로 표시하되 원본·재생·백업을 유지하고 Undo 뒤 오래된 SVG가 남지 않는다", async ({ page }) => {
  const score = await seed(page, 1000); const staff = page.getByTestId("editor-content").getByTestId("staff");
  const error = staff.getByTestId("notation-error");
  await expect(error).toContainText("exact-note"); await expect(error).toContainText("1000 ticks");
  await expect(error).toContainText("120 ticks"); await expect(staff.locator("svg")).toHaveCount(0);
  const original = await record(page, score.id);
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("playback-position")).toContainText("재생 중");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await openMode(page, "내보내기");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click(); await download;
  expect(await record(page, score.id)).toEqual(original);
  await openMode(page, "다듬기");
  await page.locator('button[data-event-id="exact-note"]').click();
  await page.getByRole("button", { name: "선택 음표 길이 4분음표", exact: true }).click();
  await expect(staff.locator("svg")).toHaveCount(1); await expect(error).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(error).toContainText("1000 ticks"); await expect(staff.locator("svg")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(staff.locator("svg")).toHaveCount(1); await expect(error).toHaveCount(0);
});
