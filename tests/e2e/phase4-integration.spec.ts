import { expect, test, type Page } from "@playwright/test";
import { storedRow, storedScore } from "./storage";

interface StoredEvent { id: string; kind: string; startTick: number; durationTicks: number; pitch?: { midi: number }; provenance?: { source: string } }
const events = (score: { parts: { measures: { events: StoredEvent[] }[] }[] }) => score.parts[0].measures.flatMap((measure) => measure.events);
const notes = (score: Parameters<typeof events>[0]) => events(score).filter((event) => event.kind === "note");

async function moveCursor(page: Page, measure: number, beat: number) {
  await page.getByLabel("커서 마디", { exact: true }).fill(String(measure));
  await page.getByLabel("커서 박", { exact: true }).fill(String(beat));
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
}

test("Phase 4 통합: 녹음→후보 검토→커서 마디에 확정→편집→재생→Undo/Redo→새로고침·재열기→JSON 백업, 녹음 데이터 비저장", async ({ page }) => {
  // The microphone: A4 for 2.5 s, then C5, generated in the page (the default fake device only beeps).
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      oscillator.frequency.setValueAtTime(440, context.currentTime);
      oscillator.frequency.setValueAtTime(523.25, context.currentTime + 2.5);
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  const id = "e2e-phase4-flow";
  await page.goto(`/editor/${id}`);
  // 400 BPM keeps the take short; one whole note C4 in measure 1 so the score is not empty.
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("400");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => notes(await storedScore(page, id)).length).toBe(1);
  const original = await storedScore(page, id);
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((db) => [db.name, db.version]));

  // 1. Record and review: two candidate pitches in order, nothing stored yet.
  const panel = page.getByTestId("recording-panel");
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-result")).toHaveAttribute("data-ok", "true", { timeout: 20_000 });
  const chipTexts = await panel.getByRole("list", { name: "채보 후보 음표" }).getByRole("listitem").allTextContents();
  expect(chipTexts[0]).toBe("A4");
  expect(chipTexts).toContain("C5");
  expect(chipTexts.indexOf("C5")).toBeGreaterThan(0);
  expect(await storedScore(page, id)).toEqual(original);

  // 2. Confirm at the cursor's measure (cursor in the middle of measure 3 → the take starts at measure 3, beat 1).
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await moveCursor(page, 3, 2);
  await panel.getByLabel("커서가 있는 마디부터").check();
  await expect(panel).toContainText("3마디부터 넣으면");
  await panel.getByRole("button", { name: "악보에 넣기", exact: true }).click();
  await expect(page.getByTestId("recording-notice")).toContainText("3마디부터 음표");
  await expect.poll(async () => notes(await storedScore(page, id)).length).toBeGreaterThan(2);
  const committed = await storedScore(page, id);
  const transcribed = notes(committed).filter((event) => event.provenance?.source === "transcription");
  expect(transcribed[0].startTick).toBe(2 * 3840);
  expect(transcribed[0].pitch?.midi).toBe(69);
  expect(transcribed.some((event) => event.pitch?.midi === 72)).toBe(true);
  expect(notes(committed)[0]).toEqual(notes(original)[0]); // the existing measure-1 note is untouched

  // 3. Keep editing with the piano (back to appending after the last event) and play a moment.
  await page.getByLabel("입력 위치", { exact: true }).selectOption("append");
  await page.getByRole("button", { name: "4분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 64", exact: true }).click();
  await expect.poll(async () => notes(await storedScore(page, id)).at(-1)?.pitch?.midi).toBe(64);
  const edited = await storedScore(page, id);
  expect(notes(edited).at(-1)?.provenance?.source).toBe("piano");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId("playback-position").getAttribute("data-tick"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // Undo history lives in memory only (it does not survive a reload), so it is checked here:
  // the piano note, then the whole take with its added measures in one step; Redo brings both back.
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await undo.click();
  await expect.poll(async () => storedScore(page, id)).toEqual(committed);
  await undo.click();
  await expect.poll(async () => storedScore(page, id)).toEqual(original);
  await redo.click();
  await expect.poll(async () => storedScore(page, id)).toEqual(committed);
  await redo.click();
  await expect.poll(async () => storedScore(page, id)).toEqual(edited);

  // 4. Reload and reopen: the same score, no candidate or recording state comes back.
  const row = await storedRow(page, id);
  await page.reload();
  await expect(page.getByTestId("recording-panel")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("recording-review")).toHaveCount(0);
  expect(await storedRow(page, id)).toEqual(row);
  await page.goto("/library");
  await page.goto(`/editor/${id}`);
  expect(await storedScore(page, id)).toEqual(edited);
  // Storage layout unchanged: same databases and versions (DB2), no recording store.
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((db) => [db.name, db.version]))).toEqual(databases);

  // 5. JSON backup is the stored score; no audio, frames or candidate fields.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  const json = Buffer.concat(chunks).toString("utf8");
  expect(JSON.parse(json)).toEqual(edited);
  expect(json).not.toMatch(/"(samples|sampleRate|frames|metronomeStartSeconds|downbeatSeconds|onsetShiftSeconds|clipboard|candidate|recording)"/);

});
