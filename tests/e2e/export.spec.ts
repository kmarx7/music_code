import { execFileSync } from "node:child_process";
import { expect, test, type Download, type Page } from "@playwright/test";
import { baseScore, withMeasureEvents } from "../fixtures/scores";
import { readSmf } from "../fixtures/smf-reader";
import { validateMusicXml, xpath } from "../fixtures/xmllint";
import { createEmptyScore, createNoteEvent, mergeTiedNotes, type Score } from "../../src/domain/score";
import { storedRow, storedScore } from "./storage";

async function seed(page: Page, score: Score) {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  await page.evaluate(async (score) => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      const tx = db.transaction("scores", "readwrite");
      tx.objectStore("scores").put({ id: score.id, updatedAt: score.updatedAt, revision: 1, json: JSON.stringify(score) });
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
  }, score);
}

async function bytes(download: Promise<Download>): Promise<{ name: string; data: Buffer }> {
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  return { name: file.suggestedFilename(), data: Buffer.concat(chunks) };
}

async function printToPdf(page: Page, path: string) {
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
  const info = execFileSync("/opt/homebrew/bin/pdfinfo", [path], { encoding: "utf8" });
  const text = execFileSync("/opt/homebrew/bin/pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
  return { pages: Number(/Pages:\s+(\d+)/.exec(info)?.[1]), size: /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info)!.slice(1).map(Number), text };
}

function melody(id: string, title: string, measures: number): Score {
  const score = createEmptyScore({ id, title, measureCount: measures, createdAt: "2026-11-13T00:00:00.000Z" });
  const steps = ["C", "D", "E", "F", "G", "A", "B"] as const;
  score.parts[0].measures.forEach((measure) => {
    measure.events = [0, 1, 2, 3].map((beat) => createNoteEvent({ id: `${measure.id}-${beat}`, step: steps[(measure.index + beat) % 7],
      octave: 4, startTick: measure.index * 3840 + beat * 960, durationTicks: 960 }));
  });
  return score;
}

test("MIDI와 MusicXML은 현재 악보를 내려받고 저장·이력을 바꾸지 않는다", async ({ page }) => {
  const id = "e2e-export-files";
  await page.goto(`/editor/${id}`);
  await page.getByLabel("악보 제목", { exact: true }).fill("출력 / 연습곡");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
  await page.getByRole("button", { name: "4분음표", exact: true }).click();
  for (const key of [60, 62, 64, 65]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(4);
  const row = await storedRow(page, id);
  const stored: Score = await storedScore(page, id);

  const midiDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const midi = await bytes(midiDownload);
  expect(midi.name).toBe("출력 _ 연습곡.mid");
  const smf = readSmf(new Uint8Array(midi.data));
  expect(smf).toMatchObject({ format: 1, division: 960, trackCount: 2 });
  expect(smf.notes.map(({ midi: key, startTick, durationTicks }) => [key, startTick, durationTicks]))
    .toEqual(mergeTiedNotes(stored.parts[0]).map((note) => [note.pitch.midi, note.startTick, note.durationTicks]));
  await expect(page.getByTestId("export-notice")).toContainText("출력 _ 연습곡.mid");

  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "MusicXML", exact: true }).click();
  const xml = await bytes(wait);
  expect(xml.name).toBe("출력 _ 연습곡.musicxml");
  const text = xml.data.toString("utf8");
  expect(validateMusicXml(text)).toMatchObject({ ok: true });
  expect(xpath(text, "string(//work/work-title)")).toBe("출력 / 연습곡");
  expect(xpath(text, "//note/pitch/step/text()").split(/\s+/)).toEqual(["C", "D", "E", "F"]);

  // Exports are reads: the stored row (revision included) is unchanged and Undo still removes the last note only.
  expect(await storedRow(page, id)).toEqual(row);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(3);
});

test("PDF: 저장 후 새 탭 인쇄 화면 → A4 PDF에 제목·머리글, 저장 내용 불변", async ({ page, context }, testInfo) => {
  const score = { ...melody("e2e-export-print", "인쇄 연습곡", 6), tempoBpm: 96 };
  await seed(page, score);
  await page.goto(`/editor/${score.id}`);
  await expect(page.getByRole("heading", { name: score.title, exact: true })).toBeVisible();
  const row = await storedRow(page, score.id);

  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "PDF (인쇄)", exact: true }).click();
  const print = await opened;
  await print.waitForURL(`**/print/${score.id}`);
  await expect(print.getByTestId("print-title")).toHaveText("인쇄 연습곡");
  await expect(print.getByTestId("print-meta")).toContainText("♩ = 96 · 4/4박자 · C 장조 · 마디 6개");
  await expect(print.getByTestId("print-view")).toHaveAttribute("data-rows", "2");
  expect(await print.title()).toBe("인쇄 연습곡");
  // No edit cursor, selection or playback marks in print.
  await expect(print.locator("[data-testid=staff-edit-cursor], [data-range-selected], [data-playing]")).toHaveCount(0);

  const pdf = await printToPdf(print, testInfo.outputPath("print.pdf"));
  expect(pdf.pages).toBe(1);
  expect(pdf.size.map(Math.round)).toEqual([595, 842]); // A4 portrait in points
  expect(pdf.text).toContain("인쇄 연습곡");
  expect(pdf.text).toMatch(/\b1\s*\/\s*1\b/); // page number "1 / 1" (pdftotext may drop the spaces)
  expect(pdf.text).not.toContain("PDF로 저장"); // the toolbar is screen-only
  expect(await storedRow(page, score.id)).toEqual(row);
});

test("PDF: 긴 악보는 여러 A4 페이지로 나뉘고 줄은 페이지 사이에서 잘리지 않는다", async ({ page }, testInfo) => {
  const score = melody("e2e-export-long", "긴 악보", 64);
  await seed(page, score);
  await page.goto(`/print/${score.id}`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-rows", "16");
  const pdf = await printToPdf(page, testInfo.outputPath("long.pdf"));
  expect(pdf.pages).toBeGreaterThan(1);
  expect(pdf.text).toMatch(new RegExp(`\\b1\\s*/\\s*${pdf.pages}\\b`));
  expect(pdf.text).toMatch(new RegExp(`\\b${pdf.pages}\\s*/\\s*${pdf.pages}\\b`));
  await page.emulateMedia({ media: "print" });
  // Every row keeps break-inside: avoid in print, so a page break never cuts through a system.
  const rows = page.locator(".print-row");
  await expect(rows).toHaveCount(16);
  expect(await rows.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).breakInside === "avoid"))).toBe(true);
  await expect(page.locator(".no-print").first()).toBeHidden();
});

test("PDF: 라벨 설정을 따르고, 기보 불가 악보와 없는 악보는 오류를 보이며 아무것도 저장하지 않는다", async ({ page }) => {
  const labelled = melody("e2e-export-labels", "라벨 악보", 1);
  await seed(page, labelled);
  await page.goto(`/print/${labelled.id}?labels=letter`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("print-rows").getByTestId("note-label")).toHaveCount(4);
  await page.goto(`/print/${labelled.id}`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("print-rows").getByTestId("note-label")).toHaveCount(0);

  const odd = withMeasureEvents({ ...baseScore(), id: "e2e-export-odd", title: "기보 불가" },
    [createNoteEvent({ id: "odd", step: "C", octave: 4, startTick: 0, durationTicks: 1001 })]);
  await seed(page, odd);
  const row = await storedRow(page, odd.id);
  await page.goto(`/print/${odd.id}`);
  await expect(page.getByTestId("print-error")).toContainText("정확한 기보를 인쇄할 수 없습니다");
  await expect(page.getByTestId("print-error")).toContainText("1마디");
  await expect(page.getByRole("button", { name: "인쇄 / PDF로 저장" })).toBeDisabled();
  await page.goto(`/editor/${odd.id}`);
  await page.getByRole("button", { name: "MusicXML", exact: true }).click();
  await expect(page.getByTestId("export-notice")).toContainText("MusicXML로 내보낼 수 없습니다");
  // MIDI keeps exact ticks, so it still exports.
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  expect(readSmf(new Uint8Array((await bytes(wait)).data)).notes).toMatchObject([{ startTick: 0, durationTicks: 1001 }]);
  expect(await storedRow(page, odd.id)).toEqual(row);

  await page.goto("/print/e2e-export-missing");
  await expect(page.getByTestId("print-error")).toContainText("저장된 악보를 찾을 수 없습니다");
  expect(await storedRow(page, "e2e-export-missing")).toBeUndefined();
});
