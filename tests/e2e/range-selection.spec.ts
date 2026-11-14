import { expect, test, type Page } from "@playwright/test";
import { openMode } from "./editor-modes";
import { storedRow, storedScore } from "./storage";

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

test("구간 선택: 쉼표·빈 구간·타이 체인 포함, 부분 타이 거부, 하이라이트 분리, 무저장, 편집·Undo·새로고침 무효화", async ({ page }) => {
  const id = "e2e-range-selection";
  await page.goto(`/editor/${id}`);
  // m1: whole C4. m2 beat 4: half D4 split and tied into m3. m3: half rest after the tied tail.
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 4);
  await openMode(page, "입력");
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click();
  await expect.poll(async () => {
    const part = (await storedScore(page, id))?.parts[0];
    return [part?.measures.flatMap((m: { events: unknown[] }) => m.events).length, part?.ties.length];
  }).toEqual([4, 1]);
  const stored = await storedScore(page, id);
  expect(stored.parts[0].measures.flatMap((m: { events: { kind: string; startTick: number }[] }) => m.events)
    .map((event: { kind: string; startTick: number }) => [event.kind, event.startTick]))
    .toEqual([["note", 0], ["note", 6720], ["note", 7680], ["rest", 8640]]);
  const rowBefore = await storedRow(page, id);

  const content = page.getByTestId("editor-content");
  await openMode(page, "다듬기");
  const status = page.getByTestId("range-selection");
  const error = page.getByTestId("range-selection-error");
  const glyphs = content.getByTestId("staff").locator('[data-event-id][data-range-selected="true"]');
  const chips = content.locator('button[data-event-id][data-range-selected="true"]');
  await expect(status).toHaveAttribute("data-selected", "off");
  await expect(status).toContainText("선택한 구간 없음");
  await expect(glyphs).toHaveCount(0);

  // One measure, one note.
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await expect(status).toHaveAttribute("data-selected", "on");
  await expect(status).toHaveAttribute("data-start-tick", "0");
  await expect(status).toHaveAttribute("data-end-tick", "3840");
  await expect(status).toHaveAttribute("data-event-count", "1");
  await expect(status).toContainText("1–1마디 선택됨 · 음표 1개 · 쉼표 0개");
  await expect(glyphs).toHaveCount(1);
  await expect(chips).toHaveCount(1);
  // Range selection is independent of the single-event edit selection:
  // the rest inserted above stays the one pressed chip and is not part of this range.
  await expect(content.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(content.locator('button[aria-pressed="true"]')).toHaveText("쉼표");
  await expect(content.locator('button[aria-pressed="true"][data-range-selected]')).toHaveCount(0);

  // A range that cuts the tie chain is rejected and nothing stays selected.
  await selectMeasures(page, 2, 2);
  await openMode(page, "다듬기");
  await expect(error).toContainText("2–3마디");
  await expect(status).toHaveAttribute("data-selected", "off");
  await expect(glyphs).toHaveCount(0);
  await expect(chips).toHaveCount(0);
  await selectMeasures(page, 3, 3);
  await openMode(page, "다듬기");
  await expect(error).toContainText("붙임줄");
  await expect(status).toHaveAttribute("data-selected", "off");

  // Keyboard only: the whole chain plus the rest and the gaps around them.
  await page.getByLabel("구간 첫 마디", { exact: true }).fill("2");
  await page.getByLabel("구간 마지막 마디", { exact: true }).fill("3");
  await page.getByLabel("구간 마지막 마디", { exact: true }).press("Enter");
  await expect(status).toHaveAttribute("data-selected", "on");
  await expect(status).toHaveAttribute("data-start-tick", "3840");
  await expect(status).toHaveAttribute("data-end-tick", "11520");
  await expect(status).toContainText("2–3마디 선택됨 · 음표 2개 · 쉼표 1개");
  await expect(error).toHaveCount(0);
  await expect(glyphs).toHaveCount(3);
  await expect(chips).toHaveCount(3);

  // The highlight survives a staff redraw (cursor move) and coexists with single-event selection.
  await moveCursor(page, 4, 1);
  await openMode(page, "입력");
  await expect(content.getByTestId("staff-edit-cursor")).toHaveAttribute("data-tick", "11520");
  await openMode(page, "다듬기");
  await expect(glyphs).toHaveCount(3);
  await content.locator("button[data-event-id]").first().click();
  await expect(content.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(content.locator('button[aria-pressed="true"]')).toHaveText("C4");
  await expect(page.getByText("선택한 음표 편집")).toBeVisible();
  await expect(status).toHaveAttribute("data-selected", "on");
  await expect(chips).toHaveCount(3);
  await content.locator("button[data-event-id]").first().click();

  // Reversed measures are rejected.
  await selectMeasures(page, 3, 2);
  await openMode(page, "다듬기");
  await expect(error).toContainText("유효한 첫 마디와 마지막 마디");
  await expect(status).toHaveAttribute("data-selected", "off");

  // An empty measure is a valid selection; the clear button removes it.
  await selectMeasures(page, 4, 4);
  await openMode(page, "다듬기");
  await expect(status).toContainText("4–4마디 선택됨 · 음표 0개 · 쉼표 0개");
  await expect(glyphs).toHaveCount(0);
  await page.getByRole("button", { name: "선택 해제", exact: true }).click();
  await expect(status).toHaveAttribute("data-selected", "off");

  // Selecting never writes: no command, no revision bump.
  await selectMeasures(page, 1, 3);
  await openMode(page, "다듬기");
  await expect(glyphs).toHaveCount(4);
  await page.waitForTimeout(800); // longer than the 400 ms autosave debounce
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // The read-only transpose preview never receives the range highlight.
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  const preview = page.getByTestId("transpose-preview");
  await preview.getByLabel("조옮김 목표 조성", { exact: true }).selectOption("major:2");
  await expect(preview.getByTestId("staff").locator("svg")).toBeVisible();
  await expect(preview.locator("[data-range-selected]")).toHaveCount(0);
  await expect(glyphs).toHaveCount(4);
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // An edit invalidates the selection, and Undo/Redo do not revive it.
  await openMode(page, "입력");
  await page.getByRole("button", { name: "MIDI 64", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(status).toHaveAttribute("data-selected", "off");
  await expect(glyphs).toHaveCount(0);
  await expect(chips).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(content.locator("button[data-event-id]")).toHaveCount(4);
  await expect(status).toHaveAttribute("data-selected", "off");
  await expect(glyphs).toHaveCount(0);
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await expect(status).toHaveAttribute("data-selected", "on");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(content.locator("button[data-event-id]")).toHaveCount(5);
  await expect(status).toHaveAttribute("data-selected", "off");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(status).toHaveAttribute("data-selected", "off");

  // Reload: the selection is UI-only and is not restored.
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await expect(status).toHaveAttribute("data-selected", "on");
  await page.reload();
  await openMode(page, "다듬기");
  await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
  await expect(page.getByTestId("range-selection")).toHaveAttribute("data-selected", "off");
  await expect(page.getByTestId("editor-content").locator("[data-range-selected]")).toHaveCount(0);
});

test("구간 선택: 모바일 터치로 구간을 선택하고 해제한다", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto("/editor/e2e-range-selection-touch");
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    await page.getByRole("tab", { name: "다듬기", exact: true }).tap(); // work modes (Phase 7 decision 4)
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await page.getByLabel("구간 마지막 마디", { exact: true }).fill("2");
    await page.getByRole("button", { name: "구간 선택", exact: true }).tap();
    const status = page.getByTestId("range-selection");
    await expect(status).toContainText("1–2마디 선택됨 · 음표 1개 · 쉼표 0개");
    await expect(page.getByTestId("editor-content").getByTestId("staff").locator('[data-range-selected="true"]')).toHaveCount(1);
    await page.getByRole("button", { name: "선택 해제", exact: true }).tap();
    await expect(status).toHaveAttribute("data-selected", "off");
  } finally { await context.close(); }
});
