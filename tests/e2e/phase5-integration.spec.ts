import { execFileSync } from "node:child_process";
import { expect, test, type Download, type Page } from "@playwright/test";
import { readSmf } from "../fixtures/smf-reader";
import { validateMusicXml, xpath } from "../fixtures/xmllint";
import { mergeTiedNotes, type Score } from "../../src/domain/score";
import { storedRow, storedScore } from "./storage";

async function download(page: Page, name: string): Promise<{ filename: string; data: Buffer }> {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file: Download = await wait;
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  return { filename: file.suggestedFilename().normalize("NFC"), data: Buffer.concat(chunks) };
}

test("Phase 5 통합: 피아노 입력→편집→조옮김→연습 속도·라벨 설정→MIDI·MusicXML·PDF 출력, 저장·이력 불변", async ({ page, context }, testInfo) => {
  const id = "e2e-phase5-flow";
  await page.goto(`/editor/${id}`);
  await page.getByLabel("악보 제목", { exact: true }).fill("Phase 5 흐름");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();

  // 1. Input: C D E (quarters) and a half-note G; edit: raise E by a semitone → F.
  await page.getByRole("button", { name: "4분음표", exact: true }).click();
  for (const key of [60, 62, 64]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 67", exact: true }).click();
  const list = page.getByTestId("editor-content");
  await list.locator("li button").nth(2).click();
  await page.getByRole("button", { name: "반음 올리기", exact: true }).click();

  // 2. Transpose C major → D major and confirm.
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  const panel = page.getByTestId("transpose-preview");
  await panel.getByLabel("조옮김 목표 조성", { exact: true }).selectOption("major:2");
  await panel.getByRole("button", { name: "확정", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  const stored: Score = await storedScore(page, id);
  expect(stored.parts[0].keySignature.fifths).toBe(2);
  const notes = mergeTiedNotes(stored.parts[0]);
  expect(notes.map((note) => note.pitch.midi)).toEqual([62, 64, 67, 69]);

  // 3. Practice settings and labels are UI state: none of them may reach an export.
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "50");
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  const row = await storedRow(page, id);

  // 4. MIDI: transposed pitches, exact ticks, score tempo 120 (500 000 µs), not the 60 BPM practice rate.
  const midi = await download(page, "MIDI");
  expect(midi.filename).toBe("Phase 5 흐름.mid");
  const smf = readSmf(new Uint8Array(midi.data));
  expect(smf.notes.map((note) => [note.midi, note.startTick, note.durationTicks]))
    .toEqual(notes.map((note) => [note.pitch.midi, note.startTick, note.durationTicks]));
  expect([...smf.metas.find((meta) => meta.type === 0x51)!.data]).toEqual([0x07, 0xa1, 0x20]);
  expect([...smf.metas.find((meta) => meta.type === 0x59)!.data]).toEqual([2, 0]);

  // 5. MusicXML: schema-valid, D major, spelling from the score, no labels as lyrics, tempo 120.
  const musicXml = await download(page, "MusicXML");
  expect(musicXml.filename).toBe("Phase 5 흐름.musicxml");
  const xml = musicXml.data.toString("utf8");
  expect(validateMusicXml(xml)).toMatchObject({ ok: true });
  expect(xpath(xml, "string(//key/fifths)")).toBe("2");
  const spelled = stored.parts[0].measures.flatMap((measure) => measure.events)
    .flatMap((event) => event.kind === "note" ? [`${event.pitch.step}${event.pitch.alter}`] : []);
  // C D F G(half, tied over the bar) in D major: D E G A–A, all natural.
  expect(spelled).toEqual(["D0", "E0", "G0", "A0", "A0"]);
  expect(Number(xpath(xml, "count(//note[pitch]/tie[@type='start'])"))).toBe(1);
  const written = Array.from({ length: spelled.length }, (_, index) => {
    const at = `(//note[pitch])[${index + 1}]/pitch`;
    return `${xpath(xml, `string(${at}/step)`)}${xpath(xml, `string(${at}/alter)`) || "0"}`;
  });
  expect(written).toEqual(spelled);
  expect(Number(xpath(xml, "count(//lyric)"))).toBe(0);
  expect(xpath(xml, "string(//sound/@tempo)")).toBe("120");

  // 6. PDF: the print tab follows the label setting and shows the transposed key.
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "PDF (인쇄)", exact: true }).click();
  const print = await opened;
  await print.waitForURL(`**/print/${id}?labels=letter`);
  await expect(print.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await expect(print.getByTestId("print-meta")).toContainText("♩ = 120 · 4/4박자 · D 장조");
  await expect(print.getByTestId("print-rows").getByTestId("note-label")).toHaveText(["D4", "E4", "G4", "A4"]);
  const path = testInfo.outputPath("phase5.pdf");
  await print.pdf({ path, preferCSSPageSize: true, printBackground: true });
  const text = execFileSync("/opt/homebrew/bin/pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
  expect(text).toContain("Phase 5 흐름");
  expect(text).toContain("D 장조");

  // 7. Nothing was stored by exporting, and the edit history still works afterwards.
  expect(await storedRow(page, id)).toEqual(row);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].keySignature.fifths).toBe(0);
});
