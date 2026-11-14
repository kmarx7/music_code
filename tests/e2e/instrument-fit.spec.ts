import { expect, test, type Page } from "@playwright/test";
import { createEmptyScore, createNoteEvent, type Score } from "../../src/domain/score";
import { openMode, openRefineSection } from "./editor-modes";
import { storedScore } from "./storage";

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

/** A piano melody C4–F5: E5 and F5 sit above the 12-string sanjo gayageum (G2–D5). */
function score(id: string): Score {
  const base = createEmptyScore({ id, title: "악기 맞추기", measureCount: 1, createdAt: "2026-11-15T00:00:00.000Z" });
  const events = [
    createNoteEvent({ id: "c4", step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
    createNoteEvent({ id: "g4", step: "G", octave: 4, startTick: 960, durationTicks: 960 }),
    createNoteEvent({ id: "e5", step: "E", octave: 5, startTick: 1920, durationTicks: 960 }),
    createNoteEvent({ id: "f5", step: "F", octave: 5, startTick: 2880, durationTicks: 960 }),
  ];
  return { ...base, parts: [{ ...base.parts[0], measures: [{ ...base.parts[0].measures[0], events }] }] };
}

test("악기에 맞추기: 악기 선택은 음을 바꾸지 않고, 음역 밖 음을 세며, 악기 음역으로 추천·확정·실행 취소가 한 번씩이다", async ({ page }) => {
  const id = "e2e-instrument-fit";
  await seed(page, score(id));
  await page.goto(`/editor/${id}`);
  await openMode(page, "다듬기");
  await openRefineSection(page, "악기에 맞추기");
  const instrument = page.getByLabel("악기", { exact: true });
  await expect(instrument).toHaveValue("piano");
  await expect(page.getByTestId("instrument-fit-summary")).toHaveText("음역 A0–C8 · 모든 음이 음역 안에 있습니다.");
  // Unconfirmed instruments are listed but cannot be chosen.
  await expect(instrument.locator("option", { hasText: "향피리 (준비 중)" })).toBeDisabled();

  await instrument.selectOption("gayageum-12-sanjo");
  await expect(page.getByTestId("instrument-fit-summary")).toHaveText("음역 G2–D5 · 범위 밖 음 2개 (낮음 0 · 높음 2)");
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  const chosen = await storedScore(page, id);
  expect(chosen.parts[0].instrument).toBe("gayageum-12-sanjo");
  expect(chosen.parts[0].measures[0].events.map((event: { pitch: { midi: number } }) => event.pitch.midi)).toEqual([60, 67, 76, 77]);

  await page.getByRole("button", { name: "이 악기 음역으로 조옮김 추천", exact: true }).click();
  const preview = page.getByTestId("transpose-preview");
  await expect(preview.getByTestId("range-target-source")).toHaveText("12현 산조가야금 음역 G2–D5으로 계산했습니다.");
  await expect(preview.getByLabel("목표 최저 MIDI", { exact: true })).toHaveValue("43");
  await expect(preview.getByLabel("목표 최고 MIDI", { exact: true })).toHaveValue("74");
  await expect(page.getByTestId("range-recommendation-summary")).toContainText("전체 적합");
  for (const candidate of await preview.getByTestId("range-candidate").all()) await expect(candidate).toHaveAttribute("data-fit", /^(full|partial)$/);
  // Nothing moved yet: the recommendation is a preview only.
  expect((await storedScore(page, id)).parts[0].measures[0].events.map((event: { pitch: { midi: number } }) => event.pitch.midi)).toEqual([60, 67, 76, 77]);

  await preview.getByRole("button", { name: /^1순위 .*반음 후보 미리보기$/ }).click();
  await preview.getByRole("button", { name: "확정", exact: true }).click();
  await expect(page.getByTestId("instrument-fit-summary")).toHaveText("음역 G2–D5 · 모든 음이 음역 안에 있습니다.");

  // One Undo reverses the transposition and leaves the instrument; the next one reverses the instrument choice.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("instrument-fit-summary")).toHaveText("음역 G2–D5 · 범위 밖 음 2개 (낮음 0 · 높음 2)");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(instrument).toHaveValue("piano");
});

test("악기에 맞추기: 낮은 음이 많은 피아노 악보에는 낮은음자리표를 권하고 적용은 실행 취소 한 번으로 되돌린다", async ({ page }) => {
  const id = "e2e-instrument-clef";
  const base = createEmptyScore({ id, title: "낮은 선율", measureCount: 1, createdAt: "2026-11-15T00:00:00.000Z" });
  const events = [
    createNoteEvent({ id: "c3", step: "C", octave: 3, startTick: 0, durationTicks: 1920 }),
    createNoteEvent({ id: "g3", step: "G", octave: 3, startTick: 1920, durationTicks: 1920 }),
  ];
  await seed(page, { ...base, parts: [{ ...base.parts[0], measures: [{ ...base.parts[0].measures[0], events }] }] });
  await page.goto(`/editor/${id}`);
  await openMode(page, "다듬기");
  await openRefineSection(page, "악기에 맞추기");
  await expect(page.getByTestId("clef-suggestion")).toHaveText("권장 음자리표: 낮은음자리표 (현재 높은음자리표)");
  await page.getByRole("button", { name: "낮은음자리표 적용", exact: true }).click();
  await expect(page.getByTestId("clef-suggestion")).toHaveCount(0);
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  expect((await storedScore(page, id)).parts[0].clef).toBe("bass");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("clef-suggestion")).toBeVisible();
});
