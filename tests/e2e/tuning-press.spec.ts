import { expect, test, type Page } from "@playwright/test";
import { createEmptyScore, createNoteEvent, type Score } from "../../src/domain/score";
import { openMode, openRefineSection } from "./editor-modes";
import { storedRow } from "./storage";

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

/** 25현, A-flat major: every note is an open string in Ab조; Db4 needs a press in Eb조. */
function score(id: string): Score {
  const base = createEmptyScore({ id, title: "조율", measureCount: 1, createdAt: "2026-11-15T00:00:00.000Z" });
  const part = base.parts[0];
  const events = [
    createNoteEvent({ id: "eb4", step: "E", alter: -1, octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "db4", step: "D", alter: -1, octave: 4, startTick: 960, durationTicks: 960 }),
    createNoteEvent({ id: "ab4", step: "A", alter: -1, octave: 4, startTick: 1920, durationTicks: 960 }),
    createNoteEvent({ id: "c5", step: "C", octave: 5, startTick: 2880, durationTicks: 960 }),
  ];
  return { ...base, parts: [{ ...part, instrument: "gayageum-25", keySignature: { ...part.keySignature, fifths: -4 },
    measures: [{ ...part.measures[0], events }] }] };
}

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("25현 조율: 조성에 맞는 조율을 추천하고, 다른 조율의 누름 표시는 화면·인쇄에 그리며 저장하지 않는다", async ({ page }) => {
  const id = "e2e-tuning-press";
  await seed(page, score(id));
  await page.goto(`/editor/${id}`);
  const staff = page.getByTestId("editor-content").getByTestId("staff");
  await expect(staff.locator('[data-event-id="db4"]')).toBeVisible();
  await expect(staff.getByTestId("press-mark")).toHaveCount(0);
  const before = await storedRow(page, id);

  await openMode(page, "다듬기");
  await openRefineSection(page, "악기에 맞추기");
  await expect(page.getByTestId("tuning-summary")).toHaveText("조율: Ab조 · 누름 없음");
  const tuning = page.getByLabel("조율", { exact: true });
  await expect(tuning.locator("option")).toHaveText(["Ab조 · 누름 없음 (추천)", "Eb조 · 누름 1개"]);

  await tuning.selectOption("eb");
  await expect(page.getByTestId("tuning-summary")).toContainText("조율: Eb조 · 누름 1개");
  await expect(staff.getByTestId("press-mark")).toHaveCount(1);
  await expect(staff.getByTestId("press-mark")).toHaveAttribute("data-press-event-id", "db4");

  // The mark sits above the note and never meets a label below the staff (checked by eye in a screenshot too).
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(staff.getByTestId("note-label")).toHaveCount(4);
  const mark = await staff.getByTestId("press-mark").evaluate((element) => element.getBoundingClientRect().toJSON());
  for (const label of await staff.getByTestId("note-label").all()) {
    const box = await label.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(overlaps(mark, box)).toBe(false);
    expect(mark.bottom).toBeLessThan(box.top);
  }

  // A view choice: nothing saved, and Undo has no step to take back (the marks stay).
  expect(await storedRow(page, id)).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(staff.getByTestId("press-mark")).toHaveCount(1);
  expect(await storedRow(page, id)).toEqual(before);

  await page.goto(`/print/${id}?tuning=eb`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("print-instrument")).toHaveText("25현 가야금 · Eb조");
  await expect(page.getByTestId("print-rows").getByTestId("press-mark")).toHaveCount(1);
  await page.goto(`/print/${id}`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("print-rows").getByTestId("press-mark")).toHaveCount(0);
  // Without a tuning the header names the instrument only.
  await expect(page.getByTestId("print-instrument")).toHaveText("25현 가야금");
});

test("12현 산조가야금: 조율이 하나라 선택 없이 맨 위 줄보다 높은 음만 누름으로 표시한다", async ({ page }) => {
  const id = "e2e-tuning-sanjo";
  const base = createEmptyScore({ id, title: "산조", measureCount: 1, createdAt: "2026-11-15T00:00:00.000Z" });
  const events = [
    createNoteEvent({ id: "d5", step: "D", octave: 5, startTick: 0, durationTicks: 1920 }),
    createNoteEvent({ id: "e5", step: "E", octave: 5, startTick: 1920, durationTicks: 1920 }),
  ];
  await seed(page, { ...base, parts: [{ ...base.parts[0], instrument: "gayageum-12-sanjo", measures: [{ ...base.parts[0].measures[0], events }] }] });
  await page.goto(`/editor/${id}`);
  const staff = page.getByTestId("editor-content").getByTestId("staff");
  await expect(staff.getByTestId("press-mark")).toHaveCount(1);
  await expect(staff.getByTestId("press-mark")).toHaveAttribute("data-press-event-id", "e5");
  await openMode(page, "다듬기");
  await openRefineSection(page, "악기에 맞추기");
  await expect(page.getByLabel("조율", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("tuning-summary")).toContainText("조율: 산조 조율 · 누름 1개");
});
