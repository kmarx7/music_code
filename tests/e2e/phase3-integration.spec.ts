import { expect, test, type Page } from "@playwright/test";
import { openMode } from "./editor-modes";
import { storedRow, storedScore } from "./storage";

interface StoredEvent { id: string; kind: string; startTick: number; durationTicks: number; pitch?: { midi: number } }
interface StoredPart { measures: { events: StoredEvent[] }[]; ties: { from: string; to: string }[]; keySignature: { fifths: number } }

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
const shape = (part: StoredPart) => part.measures.flatMap((measure) => measure.events)
  .map((event) => [event.startTick, event.durationTicks, event.pitch?.midi]);
const tickOf = async (page: Page) => Number(await page.getByTestId("playback-position").getAttribute("data-tick"));

test("Phase 3 통합: 조옮김→라벨→구간 선택→복사·잘라내기·붙여넣기→연습 속도·A–B 반복→JSON·Undo/Redo·새로고침·재열기 일치", async ({ page }) => {
  const id = "e2e-phase3-flow";
  await page.goto(`/editor/${id}`);
  // m1: whole C4. m2 beat 4: half D4 split and tied into m3.
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 2, 4);
  await openMode(page, "입력");
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  const original = [[0, 3840, 60], [6720, 960, 62], [7680, 960, 62]];
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(original);

  const content = page.getByTestId("editor-content");
  await openMode(page, "다듬기");
  const chips = content.locator("button[data-event-id]");
  const staff = content.getByTestId("staff");

  // 1. Transpose C → D major through the preview and confirm.
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  const panel = page.getByTestId("transpose-preview");
  await panel.getByLabel("조옮김 목표 조성", { exact: true }).selectOption("major:2");
  await panel.getByRole("button", { name: "확정", exact: true }).click();
  const transposed = [[0, 3840, 62], [6720, 960, 64], [7680, 960, 64]];
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(transposed);
  expect((await storedPart(page, id)).keySignature.fifths).toBe(2);

  // 2. Note labels follow the transposed pitches (display only).
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(staff.getByTestId("note-label").first()).toHaveText("D4");
  await expect(chips.first()).toHaveText("D4");

  // 3. Select the tied chain, copy it and paste it into measures 5–6.
  await selectMeasures(page, 2, 3);
  await openMode(page, "다듬기");
  await expect(page.getByTestId("range-selection")).toContainText("2–3마디 선택됨 · 음표 2개 · 쉼표 0개");
  await page.getByRole("button", { name: "구간 복사", exact: true }).click();
  await moveCursor(page, 5, 1);
  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "커서에 붙여넣기", exact: true }).click();
  await expect(chips).toHaveCount(5);
  // 4. Cut measure 1 and paste it into measure 7 (move).
  await selectMeasures(page, 1, 1);
  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "구간 잘라내기", exact: true }).click();
  await expect(chips).toHaveCount(4);
  await page.getByRole("button", { name: "커서에 붙여넣기", exact: true }).click(); // cursor is at 7:1 after the first paste
  await expect(chips).toHaveCount(5);
  const final = [[6720, 960, 64], [7680, 960, 64], [18240, 960, 64], [19200, 960, 64], [23040, 3840, 62]];
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(final);
  const finalScore = await storedScore(page, id);
  expect(finalScore.parts[0].ties).toHaveLength(2);
  expect(finalScore.parts[0].keySignature.fifths).toBe(2);
  expect(finalScore.schemaVersion).toBe(2);
  expect(new Set(finalScore.parts[0].measures.flatMap((m: { events: StoredEvent[] }) => m.events).map((e: StoredEvent) => e.id)).size).toBe(5);
  await openMode(page, "다듬기");
  await expect(staff.locator("[data-event-id]")).toHaveCount(5);
  await expect(chips).toHaveText(["E4 ⌒", "E4 ⌒", "E4 ⌒", "E4 ⌒", "D4"]);
  const rowAfterEdits = await storedRow(page, id);

  // 5. Practise the pasted measures: 150% rate, A–B loop over measures 5–6. Playback stays inside the loop.
  await openMode(page, "연습");
  await page.getByLabel("연습 속도", { exact: true }).fill("150");
  await page.getByLabel("반복 첫 마디", { exact: true }).fill("5");
  await page.getByLabel("반복 마지막 마디", { exact: true }).fill("6");
  await page.getByLabel("A–B 반복", { exact: true }).check();
  await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-start-tick", "15360");
  await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-end-tick", "23040");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => tickOf(page)).toBeGreaterThan(18240);
  await openMode(page, "다듬기");
  await expect(staff.locator('[data-event-id][data-playing="true"]')).toHaveCount(1);
  await expect(chips.nth(2).or(chips.nth(3)).and(content.locator('[data-playing="true"]'))).toHaveCount(1);
  for (let sample = 0; sample < 12; sample += 1) {
    await openMode(page, "연습");
    const tick = await tickOf(page);
    expect(tick).toBeGreaterThanOrEqual(15360);
    expect(tick).toBeLessThan(23040);
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(content.locator('[data-playing="true"]')).toHaveCount(0);

  // Labels, selection, clipboard, rate and loop never reached storage.
  await page.waitForTimeout(800); // longer than the 400 ms autosave debounce
  expect(await storedRow(page, id)).toEqual(rowAfterEdits);
  expect(finalScore.tempoBpm).toBe(120);

  // 6. JSON backup equals the stored score and carries no practice/UI state.
  const download = page.waitForEvent("download");
  await openMode(page, "내보내기");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const json = Buffer.concat(chunks).toString("utf8");
  expect(JSON.parse(json)).toEqual(finalScore);
  expect(json).not.toMatch(/"(clipboard|selection|rate|practiceRate|loop|labelMode|cursor|lengthTicks)"/);

  // 7. Undo walks back paste → cut → paste → transpose one step each; Redo returns to the same score.
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await openMode(page, "다듬기");
  await undo.click(); await expect(chips).toHaveCount(4);
  await undo.click(); await expect(chips).toHaveCount(5);
  await undo.click(); await expect(chips).toHaveCount(3);
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(transposed);
  await undo.click();
  await expect.poll(async () => shape(await storedPart(page, id))).toEqual(original);
  expect((await storedPart(page, id)).keySignature.fifths).toBe(0);
  for (let step = 0; step < 4; step += 1) await page.getByRole("button", { name: "Redo", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(chips).toHaveCount(5);
  await expect.poll(() => storedScore(page, id)).toEqual(finalScore);

  // 8. Reload: the score is restored, every practice/UI state is back to its default.
  await page.reload();
  await openMode(page, "다듬기");
  await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(5);
  await expect(page.getByLabel("악보 라벨", { exact: true })).toHaveValue("none");
  await openMode(page, "연습");
  await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "100");
  await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-loop", "off");
  await openMode(page, "다듬기");
  await expect(page.getByTestId("range-selection")).toHaveAttribute("data-selected", "off");
  await expect(page.getByTestId("clipboard-status")).toHaveAttribute("data-filled", "off");
  expect(await storedScore(page, id)).toEqual(finalScore);

  // 9. Reopen from the library.
  await openMode(page, "내보내기");
  await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
  await page.getByRole("link", { name: "열기", exact: true }).and(page.locator(`a[href="/editor/${id}"]`)).click();
  await openMode(page, "다듬기");
  await expect(page.getByTestId("editor-content").locator("button[data-event-id]")).toHaveCount(5);
  expect(await storedScore(page, id)).toEqual(finalScore);
});
