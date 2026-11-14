import { expect, test, type Page } from "@playwright/test";
import { openMode, renameScore } from "./editor-modes";
import { storedRow, storedScore } from "./storage";

interface StoredEvent { id: string; kind: string; startTick: number; durationTicks: number; pitch?: { midi: number } }
interface StoredPart { measures: { events: StoredEvent[] }[]; ties: { from: string; to: string }[] }

async function moveCursor(page: Page, measure: number, beat: number) {
  await openMode(page, "입력");
  await page.getByLabel("커서 마디", { exact: true }).fill(String(measure));
  await page.getByLabel("커서 박", { exact: true }).fill(String(beat));
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
}
async function selectMeasures(page: Page, first: number, last: number) {
  await openMode(page, "다듬기");
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
const copyButton = (page: Page) => page.getByRole("button", { name: "구간 복사", exact: true });
const pasteButton = (page: Page) => page.getByRole("button", { name: "커서에 붙여넣기", exact: true });

test("복사·붙여넣기: 무쓰기 복사, 거부 시 무변경, 타이 포함 원자 붙여넣기, Undo/Redo·저장·새로고침 일치", async ({ page }) => {
  const id = "e2e-copy-paste";
  await page.goto(`/editor/${id}`);
  // m1: whole C4. m2 beat 4: half D4 split and tied into m3.
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 4);
  await openMode(page, "입력");
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect.poll(async () => shape(await storedPart(page, id)))
    .toEqual([["note", 0, 3840, 60], ["note", 6720, 960, 62], ["note", 7680, 960, 62]]);
  const rowBefore = await storedRow(page, id);
  const revisionBefore = await revisionOf(page, id);

  const content = page.getByTestId("editor-content");
  await openMode(page, "다듬기");
  const chips = content.locator("button[data-event-id]");
  const clip = page.getByTestId("clipboard-status");
  const feedback = page.getByTestId("clipboard-feedback");
  await openMode(page, "입력");
  const cursor = page.getByTestId("edit-cursor-position");

  // Nothing selected, nothing copied: both actions are unavailable.
  await openMode(page, "다듬기");
  await expect(clip).toHaveAttribute("data-filled", "off");
  await expect(clip).toContainText("클립보드 비어 있음");
  await expect(copyButton(page)).toBeDisabled();
  await expect(pasteButton(page)).toBeDisabled();

  // An empty measure is selectable but has nothing to copy; the clipboard stays empty.
  await selectMeasures(page, 4, 4);
  await openMode(page, "다듬기");
  await copyButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "error");
  await expect(feedback).toContainText("복사할 음표·쉼표가 없습니다");
  await expect(clip).toHaveAttribute("data-filled", "off");

  // Copy the tied chain (m2–m3). Copy is read-only: no command, no write, no revision bump.
  await selectMeasures(page, 2, 3);
  await openMode(page, "다듬기");
  await copyButton(page).click();
  await expect(clip).toHaveAttribute("data-filled", "on");
  await expect(clip).toHaveAttribute("data-event-count", "2");
  await expect(clip).toHaveAttribute("data-length-ticks", "7680");
  await expect(clip).toContainText("음표 2개 · 쉼표 0개 · 2마디 길이");
  await expect(feedback).toHaveAttribute("data-kind", "ok");
  await expect(page.getByTestId("range-selection")).toHaveAttribute("data-selected", "on");
  await page.waitForTimeout(800); // longer than the 400 ms autosave debounce
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // Occupied target: rejected as a whole, nothing changes in memory or storage.
  await moveCursor(page, 1, 1);
  await openMode(page, "다듬기");
  await pasteButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "error");
  await expect(feedback).toContainText("붙여넣을 구간이 비어 있지 않습니다");
  await expect(chips).toHaveCount(3);
  // Not enough measures: rejected, no measure is added automatically.
  await moveCursor(page, 8, 1);
  await openMode(page, "다듬기");
  await pasteButton(page).click();
  await expect(feedback).toContainText("마디 공간이 부족합니다");
  await expect(chips).toHaveCount(3);
  await expect(page.getByTestId("score-summary")).toContainText("마디 8개");
  await expect(page.getByTestId("range-selection")).toHaveAttribute("data-selected", "on");
  await page.waitForTimeout(800);
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // Successful paste at the cursor: one command, one autosave, the cursor moves past the pasted block.
  await moveCursor(page, 5, 1);
  await openMode(page, "다듬기");
  await pasteButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "ok");
  await expect(feedback).toContainText("5마디 1박에 붙여넣었습니다");
  await expect(chips).toHaveCount(5);
  await openMode(page, "입력");
  await expect(cursor).toHaveAttribute("data-tick", "23040");
  await openMode(page, "다듬기");
  await expect(page.getByTestId("range-selection")).toHaveAttribute("data-selected", "off");
  await expect(clip).toHaveAttribute("data-filled", "on");
  const pastedShape = [["note", 0, 3840, 60], ["note", 6720, 960, 62], ["note", 7680, 960, 62],
    ["note", 18240, 960, 62], ["note", 19200, 960, 62]];
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(pastedShape);
  expect(await revisionOf(page, id)).toBe(revisionBefore + 1);
  const once = await storedPart(page, id);
  expect(new Set(flat(once).map((event) => event.id)).size).toBe(5);
  expect(once.ties).toHaveLength(2);
  expect(once.ties[1]).toEqual({ from: flat(once)[3].id, to: flat(once)[4].id });
  await openMode(page, "다듬기");
  await expect(content.getByTestId("staff").locator("[data-event-id]")).toHaveCount(5);

  // The clipboard survives the edit: pasting again at the moved cursor yields fresh IDs once more.
  await pasteButton(page).click();
  await expect(chips).toHaveCount(7);
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(7);
  const twice = await storedPart(page, id);
  expect(new Set(flat(twice).map((event) => event.id)).size).toBe(7);
  expect(twice.ties).toHaveLength(3);
  expect(shape(twice).slice(5)).toEqual([["note", 25920, 960, 62], ["note", 26880, 960, 62]]);
  expect(await revisionOf(page, id)).toBe(revisionBefore + 2);

  // One Undo removes exactly one paste; Redo restores it; storage follows.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(chips).toHaveCount(5);
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(pastedShape);
  expect(await storedPart(page, id)).toEqual(once);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(chips).toHaveCount(7);
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(7);
  expect(await storedPart(page, id)).toEqual(twice);

  // A selection made before an edit cannot be copied afterwards.
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await expect(copyButton(page)).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(copyButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(7);

  // Append mode has no paste position: explained, nothing applied.
  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("append");
  await openMode(page, "다듬기");
  await pasteButton(page).click();
  await expect(feedback).toHaveAttribute("data-kind", "error");
  await expect(feedback).toContainText("편집 커서에 입력");
  await expect(chips).toHaveCount(7);

  // The JSON backup matches the stored score and carries no clipboard/selection state.
  const download = page.waitForEvent("download");
  await openMode(page, "내보내기");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const json = Buffer.concat(chunks).toString("utf8");
  expect(JSON.parse(json).parts[0]).toEqual(twice);
  expect(json).not.toMatch(/clipboard|selection|lengthTicks/);

  // Reload: the pasted score is restored, the in-memory clipboard is gone.
  await page.reload();
  await openMode(page, "다듬기");
  await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(7);
  await expect(page.getByTestId("clipboard-status")).toHaveAttribute("data-filled", "off");
  await expect(pasteButton(page)).toBeDisabled();
  expect(await storedPart(page, id)).toEqual(twice);
});

test("붙여넣기: 다른 탭이 먼저 저장하면 충돌로 차단되고 메모리 편집·Undo는 유지된다", async ({ page, context }) => {
  await context.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true }); });
  const id = "e2e-paste-occ";
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(1);
  const other = await context.newPage();
  await other.goto(`/editor/${id}`);
  await openMode(other, "다듬기");
  await expect(other.getByRole("button", { name: "C4", exact: true })).toBeVisible();

  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await copyButton(page).click();
  await expect(page.getByTestId("clipboard-status")).toHaveAttribute("data-filled", "on");

  await renameScore(other, "다른 탭 최신");
  await other.getByRole("button", { name: "저장", exact: true }).click();
  await expect(other.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  const rowAfterOther = await storedRow(page, id);

  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 1);
  await openMode(page, "다듬기");
  await pasteButton(page).click();
  const chips = page.getByTestId("editor-content").locator("button[data-event-id]");
  await expect(chips).toHaveCount(2);
  await expect(page.getByTestId("storage-conflict")).toBeVisible();
  await expect(page.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  // The other tab's row is untouched: no pasted event, no revision bump, no overwrite.
  expect(await storedRow(page, id)).toEqual(rowAfterOther);
  expect((await storedScore(page, id)).title).toBe("다른 탭 최신");
  expect(flat(await storedPart(page, id))).toHaveLength(1);
  // The losing tab keeps its edit and history.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(chips).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(chips).toHaveCount(2);
  await page.waitForTimeout(800);
  expect(await storedRow(page, id)).toEqual(rowAfterOther);
});

test("붙여넣기: 다른 탭에서 삭제된 악보는 붙여넣어도 Tombstone을 되살리지 않는다", async ({ page, context }) => {
  const id = "e2e-paste-tombstone";
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => flat(await storedPart(page, id)).length).toBe(1);
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await copyButton(page).click();
  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 1);

  const library = await context.newPage();
  await library.goto("/library");
  library.once("dialog", (dialog) => dialog.accept());
  await library.locator("li").filter({ has: library.locator(`a[href="/editor/${id}"]`) }).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByTestId("storage-conflict")).toContainText("삭제된 악보");
  const tombstone = await storedRow(page, id);
  expect(tombstone).toMatchObject({ deleted: true });

  await openMode(page, "다듬기");
  await pasteButton(page).click();
  await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(2);
  await page.waitForTimeout(800);
  expect(await storedRow(page, id)).toEqual(tombstone);
  const direct = await context.newPage();
  await direct.goto(`/editor/${id}`);
  await expect(direct.getByTestId("score-open-error")).toContainText("DELETED");
  expect(await storedRow(direct, id)).toEqual(tombstone);
});

test("복사·붙여넣기: 모바일 터치로 복사하고 붙여넣는다", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const id = "e2e-copy-paste-touch";
    await page.goto(`/editor/${id}`);
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    await page.getByRole("tab", { name: "다듬기", exact: true }).tap(); // work modes (Phase 7 decision 4)
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "구간 선택", exact: true }).tap();
    await copyButton(page).tap();
    await expect(page.getByTestId("clipboard-status")).toContainText("음표 1개 · 쉼표 0개 · 1마디 길이");
    await page.getByRole("tab", { name: "입력", exact: true }).tap(); // work modes (Phase 7 decision 4)
    await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
    await moveCursor(page, 3, 1);
    await page.getByRole("tab", { name: "다듬기", exact: true }).tap(); // work modes (Phase 7 decision 4)
    await pasteButton(page).tap();
    await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(2);
    await expect.poll(async () => shape(await storedPart(page, id)))
      .toEqual([["note", 0, 960, 60], ["note", 7680, 960, 60]]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally { await context.close(); }
});
