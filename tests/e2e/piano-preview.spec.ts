import { scoreNoteCount } from "./score-summary";
import { openMode } from "./editor-modes";
import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

type AudioAudit = { values: number[]; oscillators: number; failOscillator: boolean };
async function auditAudio(page: Page, fail = false) {
  await page.addInitScript((failOscillator) => {
    const audit = { values: [] as number[], oscillators: 0, failOscillator };
    (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit = audit;
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) { audit.values.push(value); return set.call(this, value, time); };
    const create = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function () {
      if (audit.failOscillator) throw new Error("E2E audio initialization failure");
      audit.oscillators += 1; return create.call(this);
    };
  }, fail);
}
async function heard(page: Page, midi: number) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  await expect.poll(() => page.evaluate((hz) => (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.values.some((value) => Math.abs(value - hz) < 0.01), frequency)).toBe(true);
}
async function pitches(page: Page, id: string) {
  const score = await storedScore(page, id);
  return score?.parts[0].measures.flatMap((measure: { events: { pitch: { midi: number } }[] }) => measure.events)
    .map((event: { pitch: { midi: number } }) => event.pitch.midi);
}

test("피아노 미리듣기·빠른 컴퓨터 키 입력·음소거와 정상 저장", async ({ page }) => {
  const id = "e2e-piano-preview";
  await auditAudio(page); await page.goto(`/editor/${id}`);
  await openMode(page, "입력");
  const toggle = page.getByLabel("입력 소리 미리듣기", { exact: true });
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await heard(page, 60);
  const voices = await page.evaluate(() => (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.oscillators);
  await page.keyboard.type("sdfg");
  await heard(page, 67);
  await expect.poll(() => pitches(page, id)).toEqual([60, 62, 64, 65, 67]);
  expect(await page.evaluate(() => (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.oscillators)).toBe(voices);
  await openMode(page, "입력");
  await toggle.uncheck();
  await page.getByRole("button", { name: "MIDI 71", exact: true }).click();
  await expect.poll(() => pitches(page, id)).toEqual([60, 62, 64, 65, 67, 71]);
  const hz = 440 * 2 ** ((71 - 69) / 12);
  expect(await page.evaluate((frequency) => (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.values.some((value) => Math.abs(value - frequency) < 0.01), hz)).toBe(false);
  await openMode(page, "입력");
  await toggle.check();
  await page.getByRole("button", { name: "MIDI 69", exact: true }).click();
  await heard(page, 69);
  await expect.poll(() => pitches(page, id)).toEqual([60, 62, 64, 65, 67, 71, 69]);
  expect(await storedScore(page, id)).toMatchObject({ schemaVersion: 3, parts: [{ ties: [], instrument: "piano" }] });
  await page.reload();
  await expect(scoreNoteCount(page, 7)).toBeVisible();
});

test("미리듣기 오디오 실패가 음표 입력·저장·재시도를 차단하지 않는다", async ({ page }) => {
  const id = "e2e-piano-preview-failure";
  await auditAudio(page, true); await page.goto(`/editor/${id}`);
  await openMode(page, "입력");
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect(page.getByTestId("piano-preview-message")).toContainText("음표 입력과 저장은 계속됩니다");
  await expect.poll(() => pitches(page, id)).toEqual([60]);
  await page.evaluate(() => { (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.failOscillator = false; });
  await openMode(page, "입력");
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await heard(page, 62);
  await expect(page.getByTestId("piano-preview-message")).not.toContainText("시작하지 못했습니다");
  await expect.poll(() => pitches(page, id)).toEqual([60, 62]);
  await page.reload();
  await expect(scoreNoteCount(page, 2)).toBeVisible();
});

test("오디오 실패 중 동일 음 반복 입력도 Undo/Redo·저장·복원을 유지한다", async ({ page }) => {
  const id = "e2e-piano-preview-repeated";
  await auditAudio(page, true); await page.goto(`/editor/${id}`);
  await openMode(page, "입력");
  const key = page.getByRole("button", { name: "MIDI 60", exact: true });
  for (let press = 0; press < 3; press += 1) await key.click();
  await expect(page.getByTestId("piano-preview-message")).toContainText("음표 입력과 저장은 계속됩니다");
  await expect.poll(() => pitches(page, id)).toEqual([60, 60, 60]);
  const before = await storedScore(page, id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => pitches(page, id)).toEqual([60, 60]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedScore(page, id)).toEqual(before);
  await page.reload();
  await expect(scoreNoteCount(page, 3)).toBeVisible();
  expect(await storedScore(page, id)).toEqual(before);
  await page.evaluate(() => { (window as Window & { pianoAudioAudit?: AudioAudit }).pianoAudioAudit!.failOscillator = false; });
  await key.click(); await heard(page, 60);
  await expect(page.getByTestId("piano-preview-message")).not.toContainText("시작하지 못했습니다");
  await expect.poll(() => pitches(page, id)).toEqual([60, 60, 60, 60]);
  const after = await storedScore(page, id);
  expect(after.schemaVersion).toBe(3);
  expect(after.parts[0].ties).toEqual([]);
  const events = after.parts[0].measures.flatMap((measure: { events: { id: string }[] }) => measure.events);
  expect(new Set(events.map((event: { id: string }) => event.id)).size).toBe(4);
});

test("미리듣기 토글은 악보 재생을 정지하거나 Score를 변경하지 않는다", async ({ page }) => {
  const id = "e2e-piano-preview-independent";
  await auditAudio(page); await page.goto(`/editor/${id}`);
  await openMode(page, "다듬기");
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await openMode(page, "입력");
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(() => pitches(page, id)).toEqual([60]);
  const before = await storedScore(page, id);
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId("playback-position").getAttribute("data-tick"))).toBeGreaterThan(0);
  await openMode(page, "입력");
  await page.getByLabel("입력 소리 미리듣기", { exact: true }).uncheck();
  await page.getByLabel("입력 소리 미리듣기", { exact: true }).check();
  await openMode(page, "연습");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect(await storedScore(page, id)).toEqual(before);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await openMode(page, "입력");
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await heard(page, 62);
  await expect.poll(() => pitches(page, id)).toEqual([60, 62]);
});

test.describe("터치 미리듣기", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("터치 탭의 호환 클릭으로 음표나 소리가 중복되지 않는다", async ({ page }) => {
    const id = "e2e-piano-preview-touch";
    await auditAudio(page); await page.goto(`/editor/${id}`);
    for (const midi of [60, 61, 62]) {
      const key = page.getByRole("button", { name: `MIDI ${midi}`, exact: true });
      await key.scrollIntoViewIfNeeded(); await key.tap(); await heard(page, midi);
    }
    await expect.poll(() => pitches(page, id)).toEqual([60, 61, 62]);
    await openMode(page, "입력");
    await page.getByLabel("입력 소리 미리듣기", { exact: true }).uncheck();
    const key = page.getByRole("button", { name: "MIDI 64", exact: true });
    await key.scrollIntoViewIfNeeded(); await key.tap();
    await expect.poll(() => pitches(page, id)).toEqual([60, 61, 62, 64]);
  });
});
