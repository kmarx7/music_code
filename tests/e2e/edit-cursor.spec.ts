import { scoreNoteCount } from "./score-summary";
import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

async function move(page: Page, measure: number, beat: number) {
  await page.getByLabel("커서 마디", { exact: true }).fill(String(measure));
  await page.getByLabel("커서 박", { exact: true }).fill(String(beat));
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
}
async function notes(page: Page, id: string) {
  const score = await storedScore(page, id);
  return score?.parts[0].measures.flatMap((measure: { events: { kind: string; startTick: number }[] }) => measure.events)
    .filter((event: { kind: string }) => event.kind === "note").map((event: { startTick: number }) => event.startTick);
}

test("중간 빈 위치 입력·커서 전진·충돌 불변·Undo/Redo·저장 복원·끝 입력", async ({ page }) => {
  const id = "e2e-edit-cursor"; await page.goto(`/editor/${id}`);
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await move(page, 3, 2);
  const cursor = page.getByTestId("edit-cursor-position");
  await expect(cursor).toHaveAttribute("data-tick", "8640");
  await expect(page.getByTestId("staff-edit-cursor")).toHaveAttribute("data-tick", "8640");
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect(cursor).toHaveAttribute("data-tick", "9600");
  await expect.poll(() => notes(page, id)).toEqual([8640]);
  const one = await storedScore(page, id);
  await move(page, 3, 2);
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("OVERLAPPING_EVENTS");
  await expect(cursor).toHaveAttribute("data-tick", "8640");
  expect(await storedScore(page, id)).toEqual(one);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => notes(page, id)).toEqual([]);
  await expect(cursor).toHaveAttribute("data-tick", "8640");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedScore(page, id)).toEqual(one);
  await move(page, 2, 1.5);
  await page.getByRole("button", { name: "MIDI 64", exact: true }).click();
  await expect.poll(() => notes(page, id)).toEqual([4320, 8640]);
  const saved = await storedScore(page, id);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.reload();
  await expect(scoreNoteCount(page, 2)).toBeVisible();
  expect(await storedScore(page, id)).toEqual(saved);
  await expect(page.getByLabel("입력 위치", { exact: true })).toHaveValue("append");
  await page.getByRole("button", { name: "MIDI 67", exact: true }).click();
  await expect.poll(() => notes(page, id)).toEqual([4320, 8640, 9600]);
});

test("커서 입력은 기존 타이를 보존하고 쉼표 충돌·악보 끝 초과를 거부한다", async ({ page }) => {
  const id = "e2e-edit-cursor-ties"; await page.goto(`/editor/${id}`);
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await move(page, 1, 4);
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect(page.getByTestId("edit-cursor-position")).toHaveAttribute("data-tick", "4800");
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].ties.length).toBe(1);
  const tied = await storedScore(page, id);
  await page.getByRole("button", { name: "4분음표", exact: true }).click();
  await move(page, 1, 1);
  await page.getByRole("button", { name: "MIDI 64", exact: true }).click();
  await expect.poll(() => notes(page, id)).toEqual([0, 2880, 3840]);
  expect((await storedScore(page, id)).parts[0].ties).toEqual(tied.parts[0].ties);
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click(); // Existing append-rest policy: tick 4800.
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[1].events.length).toBe(2);
  const mixed = await storedScore(page, id);
  await move(page, 2, 2);
  await page.getByRole("button", { name: "MIDI 67", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("OVERLAPPING_EVENTS");
  expect(await storedScore(page, id)).toEqual(mixed);
  await move(page, 8, 4);
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 67", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("마디 공간이 부족");
  await expect(page.getByTestId("edit-cursor-position")).toHaveAttribute("data-tick", "29760");
  expect(await storedScore(page, id)).toEqual(mixed);
});

test.describe("모바일 편집 커서", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("6/8 박 위치를 선택해 터치 입력하고 마지막 tick을 안전하게 처리한다", async ({ page }) => {
    const id = "e2e-edit-cursor-touch"; await page.goto(`/editor/${id}`);
    await page.getByLabel("박자", { exact: true }).selectOption("6/8");
    await page.getByRole("button", { name: "박자 적용", exact: true }).click();
    await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
    await move(page, 8, 6);
    await page.getByRole("button", { name: "8분음표", exact: true }).tap();
    const key = page.getByRole("button", { name: "MIDI 60", exact: true });
    await key.scrollIntoViewIfNeeded(); await key.tap();
    await expect.poll(() => notes(page, id)).toEqual([22560]);
    await expect(page.getByTestId("edit-cursor-position")).toHaveAttribute("data-tick", "23040");
    await key.tap();
    await expect(page.locator('p[role="status"]')).toContainText("마디를 추가");
    await expect.poll(() => notes(page, id)).toEqual([22560]);
    await page.getByRole("button", { name: "마디 추가", exact: true }).tap();
    await key.scrollIntoViewIfNeeded(); await key.tap();
    await expect.poll(() => notes(page, id)).toEqual([22560, 23040]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
