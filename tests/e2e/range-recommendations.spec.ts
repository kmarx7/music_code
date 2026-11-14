import { expect, test, type Page } from "@playwright/test";
import { openMode, renameScore } from "./editor-modes";
import { storedScore } from "./storage";
async function ready(page: Page, id: string) {
  await page.goto(`/editor/${id}`); await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "저장", exact: true }).click(); await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
}
async function raw(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<unknown>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    } finally { db.close(); }
  }, id);
}
async function calculate(page: Page, low: number, high: number) {
  await openMode(page, "다듬기");
  await page.getByLabel("목표 최저 MIDI", { exact: true }).fill(String(low));
  await page.getByLabel("목표 최고 MIDI", { exact: true }).fill(String(high));
  await page.getByRole("button", { name: "추천 계산", exact: true }).click();
  await expect(page.getByTestId("range-recommendation-summary")).toBeVisible();
}
const choose = (page: Page, delta: number) => page.getByRole("button", { name: `1순위 ${delta > 0 ? "+" : ""}${delta}반음 후보 미리보기`, exact: true });

test("전체 음역·추천은 무쓰기이며 옥타브 후보의 확정·Undo/Redo·저장·새로고침이 일치한다", async ({ page }) => {
  const id = "e2e-range-flow"; await ready(page, id);
  for (const midi of [60, 62, 64, 67]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click(); await save(page);
  await openMode(page, "다듬기");
  await expect(page.getByTestId("score-range")).toContainText("C4 (MIDI 60) ~ G4 (MIDI 67)");
  await expect(page.getByTestId("score-range")).toContainText("표기 음표 4개 / 논리적 발음 4개");
  const before = await raw(page, id);
  await page.evaluate(() => {
    const state = window as typeof window & { rangeWrites: number }; state.rangeWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) { state.rangeWrites++; return put.apply(this, args); };
  });
  await page.getByRole("button", { name: "조옮김", exact: true }).click(); await calculate(page, 62, 69);
  await openMode(page, "다듬기");
  await expect(page.getByTestId("range-recommendation-summary")).toContainText("전체 적합");
  await choose(page, 2).click(); await expect(page.getByTestId("transpose-movement")).toContainText("+2반음");
  await expect(page.getByTestId("score-range")).toContainText("MIDI 60");
  await page.getByTestId("transpose-preview").getByRole("button", { name: "취소", exact: true }).click();
  expect(await raw(page, id)).toEqual(before);
  expect(await page.evaluate(() => (window as typeof window & { rangeWrites: number }).rangeWrites)).toBe(0);
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await page.getByRole("button", { name: "조옮김", exact: true }).click(); await calculate(page, 84, 91); await choose(page, 24).click();
  await openMode(page, "다듬기");
  const preview = page.getByTestId("transpose-preview");
  await expect(preview.getByTestId("note-label")).toHaveText(["C6", "D6", "E6", "G6"]);
  await preview.getByRole("button", { name: "확정", exact: true }).click();
  await expect(page.getByTestId("score-range")).toContainText("C6 (MIDI 84) ~ G6 (MIDI 91)");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByTestId("score-range")).toContainText("C4 (MIDI 60)");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(page.getByTestId("score-range")).toContainText("C6 (MIDI 84)");
  await save(page); const changed = await storedScore(page, id); expect(changed.schemaVersion).toBe(3); expect(changed).not.toHaveProperty("targetRange");
  await openMode(page, "다듬기");
  await page.reload(); await expect(page.getByTestId("score-range")).toContainText("C6 (MIDI 84) ~ G6 (MIDI 91)"); expect(await storedScore(page, id)).toEqual(changed);
});

test("목표 변경 및 현재 편집 변경은 오래된 추천과 확정을 차단한다", async ({ page }) => {
  const id = "e2e-range-stale"; await ready(page, id); await page.getByRole("button", { name: "MIDI 60", exact: true }).click(); await save(page);
  await openMode(page, "다듬기"); await page.getByRole("button", { name: "조옮김", exact: true }).click(); await calculate(page, 62, 62); await choose(page, 2).click();
  await openMode(page, "다듬기");
  await page.getByLabel("목표 최고 MIDI", { exact: true }).fill("63");
  await expect(page.getByTestId("range-candidate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "확정", exact: true })).toBeDisabled();
  await calculate(page, 62, 62);
  await renameScore(page, "추천 중 실제 편집");
  await openMode(page, "다듬기");
  await expect(choose(page, 2)).toBeDisabled(); await choose(page, 2).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("button", { name: "확정", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "취소", exact: true }).click(); await save(page);
  const stored = await storedScore(page, id); expect(stored.title).toBe("추천 중 실제 편집"); expect(stored.parts[0].measures[0].events[0].pitch.midi).toBe(60);
});

test("다른 탭의 저장·삭제 알림은 추천 선택을 차단하고 원시 최신본/Tombstone을 보호한다", async ({ context }) => {
  for (const action of ["save", "delete"] as const) {
    const page = await context.newPage(); const other = await context.newPage(); const id = `e2e-range-${action}`;
    try {
      await ready(page, id); await page.getByRole("button", { name: "MIDI 60", exact: true }).click(); await save(page);
      await openMode(page, "다듬기"); await page.getByRole("button", { name: "조옮김", exact: true }).click(); await calculate(page, 62, 62);
      if (action === "save") {
        await ready(other, id); await renameScore(other, "다른 탭 최신본"); await save(other);
      } else {
        await other.goto("/library"); other.once("dialog", (dialog) => dialog.accept());
        await other.locator("li").filter({ has: other.locator(`a[href="/editor/${id}"]`) }).getByRole("button", { name: "삭제", exact: true }).click();
      }
      await expect(page.getByTestId("storage-conflict")).toBeVisible(); const protectedRecord = await raw(page, id);
      await openMode(page, "다듬기");
      await expect(choose(page, 2)).toBeDisabled(); await choose(page, 2).evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.getByRole("button", { name: "확정", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "취소", exact: true }).click(); expect(await raw(page, id)).toEqual(protectedRecord);
    } finally { await page.close(); await other.close(); }
  }
});
