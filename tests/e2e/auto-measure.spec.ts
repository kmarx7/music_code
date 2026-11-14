import { expect, test } from "@playwright/test";
import { storedScore } from "./storage";

// UAT fix (option A): typing past the end of a full score adds a measure in the same step, and one Undo takes both back.
test("악보가 가득 차도 끝 입력은 마디를 하나 붙여 이어 쓰고, Undo 한 번에 음과 마디가 함께 돌아간다", async ({ page }) => {
  const id = "e2e-auto-measure";
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  const key = page.getByRole("button", { name: "MIDI 60", exact: true });
  for (let index = 0; index < 8; index += 1) await key.click();
  const shape = async () => {
    const part = (await storedScore(page, id))?.parts[0];
    return part ? { measures: part.measures.length, notes: part.measures.flatMap((measure: { events: unknown[] }) => measure.events).length } : null;
  };
  await expect.poll(shape).toEqual({ measures: 8, notes: 8 });

  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect.poll(shape).toEqual({ measures: 9, notes: 9 });
  await expect(page.locator(".editor-message")).toHaveCount(0);
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click();
  await expect.poll(shape).toEqual({ measures: 10, notes: 10 });

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(shape).toEqual({ measures: 9, notes: 9 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(shape).toEqual({ measures: 8, notes: 8 });
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(shape).toEqual({ measures: 9, notes: 9 });
});
