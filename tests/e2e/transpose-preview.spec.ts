import { scoreNoteCount } from "./score-summary";
import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

async function raw(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<{ revision: number; deleted?: boolean; json?: string }>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  }, id);
}
async function ready(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
}
async function seed(page: Page, id: string) {
  await ready(page, id);
  for (const midi of [60, 62, 64, 67]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click();
  await save(page);
}
async function preview(page: Page) {
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  const panel = page.getByTestId("transpose-preview");
  await panel.getByLabel("조옮김 목표 조성", { exact: true }).selectOption("major:2");
  await expect(panel.getByTestId("transpose-movement")).toContainText("D 장조");
  await expect(panel.getByTestId("transpose-movement")).toContainText("+2반음");
  await expect(panel.getByTestId("staff").locator("svg")).toBeVisible();
  return panel;
}
async function midis(page: Page, id: string): Promise<number[]> {
  const score = await storedScore(page, id);
  return score.parts[0].measures.flatMap((measure: { events: { kind: string; pitch?: { midi: number } }[] }) =>
    measure.events.filter((event) => event.kind === "note").map((event) => event.pitch!.midi));
}

test("조옮김 미리보기 취소는 원시 저장본·커서·편집 이력을 보존한다", async ({ page }) => {
  const id = "e2e-transpose-cancel"; await seed(page, id);
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  const cursor = await page.getByTestId("edit-cursor-position").getAttribute("data-tick");
  const before = await raw(page, id); const panel = await preview(page);
  expect(await raw(page, id)).toEqual(before);
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel).toHaveCount(0); expect(await raw(page, id)).toEqual(before);
  await expect(page.getByTestId("edit-cursor-position")).toHaveAttribute("data-tick", cursor!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 64]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 64, 67]);
});

test("확정은 조표·음높이를 한 Undo 단위로 바꾸고 저장·새로고침 후 복원한다", async ({ page }) => {
  const id = "e2e-transpose-confirm"; await seed(page, id); const original = await storedScore(page, id);
  const panel = await preview(page); await panel.getByRole("button", { name: "확정", exact: true }).click();
  await expect(panel).toHaveCount(0); await save(page);
  const changed = await storedScore(page, id);
  expect(changed.parts[0].keySignature).toMatchObject({ tonic: "D", fifths: 2 });
  expect(await midis(page, id)).toEqual([62, 64, 66, 69]);
  await expect(page.getByTestId("editor-content").getByRole("button", { name: "F#4", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedScore(page, id)).toEqual(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedScore(page, id)).toEqual(changed);
  await page.reload(); await expect(scoreNoteCount(page, 4)).toBeVisible();
  expect(await storedScore(page, id)).toEqual(changed);
  await expect(page.getByTestId("staff").locator("svg")).toBeVisible();
});

test("미리보기 도중 실제 편집은 오래된 후보 확정을 차단한다", async ({ page }) => {
  const id = "e2e-transpose-stale"; await seed(page, id); const panel = await preview(page);
  await page.getByRole("textbox", { name: "악보 제목", exact: true }).fill("미리보기 중 제목 변경");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
  await expect(panel).toContainText("원본 또는 저장 버전이 변경");
  const confirm = panel.getByRole("button", { name: "확정", exact: true }); await expect(confirm).toBeDisabled();
  await confirm.evaluate((button: HTMLButtonElement) => button.click());
  await panel.getByRole("button", { name: "취소", exact: true }).click(); await save(page);
  expect((await storedScore(page, id)).title).toBe("미리보기 중 제목 변경");
  expect(await midis(page, id)).toEqual([60, 62, 64, 67]);
  expect((await storedScore(page, id)).parts[0].keySignature.fifths).toBe(0);
});

test("다른 탭의 저장 알림 후 후보 확정을 차단하고 최신 원본을 보존한다", async ({ page, context }) => {
  const id = "e2e-transpose-conflict"; await seed(page, id);
  const other = await context.newPage(); await ready(other, id); const panel = await preview(page);
  await other.getByRole("textbox", { name: "악보 제목", exact: true }).fill("다른 탭 최신본");
  await other.getByRole("button", { name: "제목 변경", exact: true }).click(); await save(other);
  await expect(page.getByTestId("storage-conflict")).toBeVisible();
  const before = await raw(other, id); const confirm = panel.getByRole("button", { name: "확정", exact: true });
  await expect(confirm).toBeDisabled(); await confirm.evaluate((button: HTMLButtonElement) => button.click());
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  expect(await raw(page, id)).toEqual(before);
  expect((await storedScore(page, id)).title).toBe("다른 탭 최신본");
  await expect(page.getByRole("heading", { name: "새 악보", exact: true })).toBeVisible();
});

test("다른 탭의 삭제 알림 이후 후보 확정과 자동 재생성을 차단한다", async ({ page, context }) => {
  const id = "e2e-transpose-delete"; await seed(page, id); const panel = await preview(page);
  const library = await context.newPage(); await library.goto("/library");
  library.once("dialog", (dialog) => dialog.accept());
  await library.locator("li").filter({ has: library.locator(`a[href="/editor/${id}"]`) }).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByTestId("storage-conflict")).toContainText("삭제된 악보");
  const tombstone = await raw(page, id); expect(tombstone.deleted).toBe(true);
  const confirm = panel.getByRole("button", { name: "확정", exact: true }); await expect(confirm).toBeDisabled();
  await confirm.evaluate((button: HTMLButtonElement) => button.click());
  await panel.press("Escape"); await expect(panel).toHaveCount(0);
  expect(await raw(page, id)).toEqual(tombstone);
});
