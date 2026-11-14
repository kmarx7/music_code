import { expect, test, type Page, type Locator } from "@playwright/test";
import { openMode } from "./editor-modes";
import { storedScore } from "./storage";

const mainStaff = (page: Page) => page.getByTestId("editor-content").getByTestId("staff");
const labels = (staff: Locator) => staff.getByTestId("note-label");
async function save(page: Page) {
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
}
async function raw(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const request = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<unknown>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    } finally { db.close(); }
  }, id);
}
async function preview(page: Page, key: string) {
  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "조옮김", exact: true }).click(); const panel = page.getByTestId("transpose-preview");
  await panel.getByLabel("조옮김 목표 조성", { exact: true }).selectOption(key); return panel;
}
async function readable(staff: Locator) {
  // Geometry checks use stable application label IDs, not generated VexFlow IDs.
  await expect(staff.locator("svg")).toBeVisible();
  expect(await staff.evaluate(async (element) => {
    await element.ownerDocument.fonts.ready;
    const svg = element.querySelector("svg")!; const view = svg.viewBox.baseVal;
    const groups = Array.from(element.querySelectorAll<SVGGraphicsElement>('[data-testid="note-label"]'));
    const rects = groups.map((label) => label.getBBox());
    return rects.length > 0 && rects.every((rect) => rect.width > 0 && rect.height > 0 && rect.x >= view.x && rect.y >= view.y && rect.x + rect.width <= view.x + view.width && rect.y + rect.height <= view.y + view.height) &&
      rects.every((a, i) => rects.slice(i + 1).every((b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y));
  })).toBe(true);
}

test("표시 안 함/음이름/계이름 전환은 선택·커서·Redo·원시 저장본 및 revision을 보존한다", async ({ page }) => {
  const id = "e2e-label-modes"; await page.goto(`/editor/${id}`);
  for (const midi of [60, 66, 64]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click(); await save(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await save(page);
  const source = await raw(page, id); const score = await storedScore(page, id); const staff = mainStaff(page);
  await expect(page.getByLabel("악보 라벨", { exact: true })).toHaveValue("none"); await expect(labels(staff)).toHaveCount(0);
  await openMode(page, "다듬기");
  await page.getByTestId("editor-content").getByRole("button", { name: "C4", exact: true }).click();
  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  const cursor = await page.getByTestId("edit-cursor-position").getAttribute("data-tick");
  await page.clock.install();
  await page.evaluate(() => {
    const state = window as typeof window & { labelWrites: number }; state.labelWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) { state.labelWrites++; return put.apply(this, args); };
  });
  for (const [mode, expected] of [["letter", ["C4", "F♯4"]], ["fixed-do", ["도", "파♯"]], ["none", []]] as const) {
    await page.getByLabel("악보 라벨", { exact: true }).selectOption(mode);
    await expect(labels(staff)).toHaveText([...expected]);
    if (mode !== "none") await readable(staff);
    await openMode(page, "다듬기");
    await expect(page.getByTestId("editor-content").locator('button[aria-pressed="true"]')).toHaveCount(1);
    await openMode(page, "입력");
    await expect(page.getByTestId("edit-cursor-position")).toHaveAttribute("data-tick", cursor!);
  }
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => (window as typeof window & { labelWrites: number }).labelWrites)).toBe(0);
  expect(await raw(page, id)).toEqual(source); expect(await storedScore(page, id)).toEqual(score);
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await save(page);
  expect((await storedScore(page, id)).parts[0].measures[0].events).toHaveLength(3);
});

test("D/Db/C# 후보·확정·취소·Undo/Redo의 라벨은 각 Score 철자와 동기화된다", async ({ page }) => {
  const id = "e2e-label-transpose"; await page.goto(`/editor/${id}`);
  for (const midi of [60, 62, 64, 67]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click(); await save(page);
  const original = await raw(page, id); const staff = mainStaff(page);
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  for (const [key, expected] of [
    ["major:2", ["D4", "E4", "F♯4", "A4"]], ["major:-5", ["D♭4", "E♭4", "F4", "A♭4"]], ["major:7", ["C♯4", "D♯4", "E♯4", "G♯4"]],
  ] as const) {
    const panel = await preview(page, key); await expect(labels(panel.getByTestId("staff"))).toHaveText([...expected]);
    await expect(labels(staff)).toHaveText(["C4", "D4", "E4", "G4"]); await readable(panel.getByTestId("staff"));
    await panel.getByRole("button", { name: "취소", exact: true }).click(); expect(await raw(page, id)).toEqual(original);
  }
  const panel = await preview(page, "major:2");
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("fixed-do");
  await expect(labels(panel.getByTestId("staff"))).toHaveText(["레", "미", "파♯", "라"]);
  await openMode(page, "다듬기");
  await expect(panel.getByRole("button", { name: "확정", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "확정", exact: true }).click(); await expect(labels(staff)).toHaveText(["레", "미", "파♯", "라"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(labels(staff)).toHaveText(["도", "레", "미", "솔"]);
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(labels(staff)).toHaveText(["레", "미", "파♯", "라"]); await save(page);
  expect((await storedScore(page, id)).parts[0].measures[0].events[2].pitch).toMatchObject({ step: "F", alter: 1, midi: 66 });
});

test("타이 머리 라벨·편집·재생 하이라이트·모드 전환·JSON 및 새로고침 복원을 유지한다", async ({ page }) => {
  const id = "e2e-label-playback"; await page.goto(`/editor/${id}`);
  await openMode(page, "다듬기");
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("60"); await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await openMode(page, "입력");
  for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByRole("button", { name: "2분음표", exact: true }).click(); await page.getByRole("button", { name: "MIDI 67", exact: true }).click();
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click(); await save(page);
  const staff = mainStaff(page); await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(labels(staff)).toHaveText(["C4", "C4", "C4", "G4"]); await expect(staff.locator(".vf-stavetie")).toHaveCount(1); await readable(staff);
  const firstId = (await storedScore(page, id)).parts[0].measures[0].events[0].id;
  await openMode(page, "다듬기");
  await page.getByTestId("editor-content").locator(`button[data-event-id="${firstId}"]`).click();
  await page.getByRole("button", { name: "반음 올리기", exact: true }).click(); await expect(labels(staff)).toHaveText(["C♯4", "C4", "C4", "G4"]); await save(page);
  const before = await storedScore(page, id);
  await openMode(page, "연습");
  await page.getByLabel("메트로놈", { exact: true }).check(); await page.getByRole("button", { name: "Play", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(staff.locator('[data-event-id][data-playing="true"]')).toHaveCount(1);
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("fixed-do");
  await expect(labels(staff)).toHaveText(["도♯", "도", "도", "솔"]);
  await openMode(page, "연습");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible(); await expect(page.getByLabel("메트로놈", { exact: true })).toBeChecked();
  await openMode(page, "다듬기");
  await expect(staff.locator('[data-event-id][data-playing="true"]')).toHaveCount(1);
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Stop", exact: true }).click(); await expect(staff.locator('[data-playing="true"]')).toHaveCount(0);
  await openMode(page, "내보내기");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const stream = await (await download).createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toEqual(before);
  await page.reload(); await expect(page.getByLabel("악보 라벨", { exact: true })).toHaveValue("none"); await expect(labels(staff)).toHaveCount(0);
  expect(await storedScore(page, id)).toEqual(before); expect(before).not.toHaveProperty("labelMode");
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter"); await expect(labels(staff)).toHaveText(["C♯4", "C4", "C4", "G4"]);
});
