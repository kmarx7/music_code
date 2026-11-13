import { expect, test, type Page } from "@playwright/test";
import { storedRow, storedScore } from "./storage";

interface StoredEvent { id: string; kind: string; startTick: number; durationTicks: number; pitch?: { midi: number } }
interface StoredPart { measures: { events: StoredEvent[] }[]; ties: { from: string; to: string }[] }

async function moveCursor(page: Page, measure: number, beat: number) {
  await page.getByLabel("커서 마디", { exact: true }).fill(String(measure));
  await page.getByLabel("커서 박", { exact: true }).fill(String(beat));
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
}
async function selectMeasures(page: Page, first: number, last: number) {
  await page.getByLabel("구간 첫 마디", { exact: true }).fill(String(first));
  await page.getByLabel("구간 마지막 마디", { exact: true }).fill(String(last));
  await page.getByRole("button", { name: "구간 선택", exact: true }).click();
}
async function storedPart(page: Page, id: string): Promise<StoredPart> {
  return (await storedScore(page, id)).parts[0];
}
const flat = (part: StoredPart) => part.measures.flatMap((measure) => measure.events);
const shape = (part: StoredPart) => flat(part).map((event) => [event.kind, event.startTick, event.durationTicks, event.pitch?.midi]);
const revisionOf = async (page: Page, id: string) => (await storedRow(page, id) as { revision: number }).revision;
const cutButton = (page: Page) => page.getByRole("button", { name: "구간 잘라내기", exact: true });

test("잘라내기: 실패 시 clipboard·악보 유지, 성공 시 원자 삭제와 clipboard 교체, gap 보존, Undo 1회 복원, 붙여넣기·저장 일치", async ({ page }) => {
  const id = "e2e-cut";
  await page.goto(`/editor/${id}`);
  // m1: whole C4. m2 beat 4: half D4 split and tied into m3.
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 4);
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  const original = [["note", 0, 3840, 60], ["note", 6720, 960, 62], ["note", 7680, 960, 62]];
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(original);
  const partBefore = await storedPart(page, id);
  const rowBefore = await storedRow(page, id);
  const revisionBefore = await revisionOf(page, id);

  const chips = page.getByTestId("editor-content").locator("button[data-event-id]");
  const clip = page.getByTestId("clipboard-status");
  const feedback = page.getByTestId("clipboard-feedback");
  const selection = page.getByTestId("range-selection");
  await expect(cutButton(page)).toBeDisabled();

  // Put m1 on the clipboard first so a failed cut can be shown to keep it.
  await selectMeasures(page, 1, 1);
  await page.getByRole("button", { name: "구간 복사", exact: true }).click();
  await expect(clip).toHaveAttribute("data-length-ticks", "3840");
  await expect(clip).toHaveAttribute("data-event-count", "1");

  // A range that cuts the tie chain is never selectable, so it can never be cut.
  await selectMeasures(page, 2, 2);
  await expect(selection).toHaveAttribute("data-selected", "off");
  await expect(cutButton(page)).toBeDisabled();
  // An empty measure has nothing to cut: the previous clipboard, the score and storage are kept.
  await selectMeasures(page, 4, 4);
  await cutButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "error");
  await expect(feedback).toContainText("잘라낼 음표·쉼표가 없습니다");
  await expect(clip).toHaveAttribute("data-length-ticks", "3840");
  await expect(clip).toHaveAttribute("data-event-count", "1");
  await expect(chips).toHaveCount(3);
  await page.waitForTimeout(800); // longer than the 400 ms autosave debounce
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // Successful cut of the whole tied chain: one command, one save, the gap stays, nothing shifts.
  await selectMeasures(page, 2, 3);
  await cutButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "ok");
  await expect(feedback).toContainText("잘라냈습니다");
  await expect(chips).toHaveCount(1);
  await expect(clip).toHaveAttribute("data-length-ticks", "7680");
  await expect(clip).toHaveAttribute("data-event-count", "2");
  await expect(selection).toHaveAttribute("data-selected", "off");
  await expect(page.getByTestId("score-summary")).toContainText("마디 8개");
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual([["note", 0, 3840, 60]]);
  expect((await storedPart(page, id)).ties).toEqual([]);
  expect(await revisionOf(page, id)).toBe(revisionBefore + 1);

  // One Undo restores every cut event and the tie; the clipboard is not part of history.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(chips).toHaveCount(3);
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(3);
  expect(await storedPart(page, id)).toEqual(partBefore);
  await expect(clip).toHaveAttribute("data-length-ticks", "7680");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(chips).toHaveCount(1);
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(1);

  // Cut then paste elsewhere = move. Fresh IDs, the tie is rebuilt.
  await moveCursor(page, 5, 1);
  await page.getByRole("button", { name: "커서에 붙여넣기", exact: true }).click();
  await expect(chips).toHaveCount(3);
  await expect.poll(async () => shape(await storedPart(page, id)))
    .toEqual([["note", 0, 3840, 60], ["note", 18240, 960, 62], ["note", 19200, 960, 62]]);
  const moved = await storedPart(page, id);
  expect(moved.ties).toEqual([{ from: flat(moved)[1].id, to: flat(moved)[2].id }]);
  expect(flat(moved).map((event) => event.id)).not.toContain(flat(partBefore)[1].id);

  await page.reload();
  await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(3);
  await expect(page.getByTestId("clipboard-status")).toHaveAttribute("data-filled", "off");
  expect(await storedPart(page, id)).toEqual(moved);
});

test("잘라내기: 모바일 터치로 잘라내고 붙여넣는다", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const id = "e2e-cut-touch";
    await page.goto(`/editor/${id}`);
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    await page.getByRole("tab", { name: "편집", exact: true }).tap(); // phone layout: P6-03 tabs
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "구간 선택", exact: true }).tap();
    await cutButton(page).tap();
    await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(0);
    await page.getByRole("tab", { name: "입력", exact: true }).tap(); // phone layout: P6-03 tabs
    await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
    await moveCursor(page, 2, 1);
    await page.getByRole("tab", { name: "편집", exact: true }).tap(); // phone layout: P6-03 tabs
    await page.getByRole("button", { name: "커서에 붙여넣기", exact: true }).tap();
    await expect.poll(async () => shape(await storedPart(page, id))).toEqual([["note", 3840, 960, 60]]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally { await context.close(); }
});
