import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";


async function storedRest(page: Page, id: string) {
  const score = await storedScore(page, id);
  const rest = score?.parts[0].measures.flatMap((m: { events: { kind: string; startTick: number; durationTicks: number }[] }) => m.events)
    .find((event: { kind: string }) => event.kind === "rest");
  return rest ? { startTick: rest.startTick, durationTicks: rest.durationTicks } : null;
}

test("쉼표 삽입·선택·길이/위치 수정·경계/충돌 거부·Undo/Redo·삭제·저장 복원", async ({ page }) => {
  const id = "e2e-rest-edit";
  await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click();
  await expect(page.getByText("선택한 쉼표 편집", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "쉼표", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("staff").locator("svg .vf-stavenote")).toHaveCount(2);
  await page.getByRole("button", { name: "선택 쉼표 길이 8분음표", exact: true }).click();
  await expect(page.getByText("쉼표 · 480 ticks", { exact: true })).toBeVisible();
  await page.getByLabel("시작 마디").fill("2");
  await page.getByLabel("마디 안 박 위치").fill("2");
  await page.getByRole("button", { name: "쉼표 위치 변경", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 4800, durationTicks: 480 });

  await page.getByLabel("시작 마디").fill("1");
  await page.getByLabel("마디 안 박 위치").fill("1");
  await page.getByRole("button", { name: "쉼표 위치 변경", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("OVERLAPPING_EVENTS");
  await page.getByRole("button", { name: "선택 쉼표 길이 온음표", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("EVENT_OUT_OF_MEASURE");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 960, durationTicks: 480 });
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 4800, durationTicks: 480 });
  await page.reload();
  await expect(page.getByText(/쉼표 1개/)).toBeVisible();
  await page.getByRole("button", { name: "쉼표", exact: true }).click();
  await expect(page.getByLabel("시작 마디")).toHaveValue("2");
  await expect(page.getByLabel("마디 안 박 위치")).toHaveValue("2");
  await expect(page.getByTestId("staff").locator("svg .vf-stavenote")).toHaveCount(2);
  await page.getByRole("button", { name: "선택 쉼표 삭제", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toBeNull();
  await expect(page.getByTestId("staff").locator("svg .vf-stavenote")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 4800, durationTicks: 480 });
});

test("음표·쉼표 혼합 악보에서 쉼표 편집 후 붙임줄과 음표 위치를 보존한다", async ({ page }) => {
  const id = "e2e-rest-tie";
  await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect(page.locator("button[aria-pressed]", { hasText: "⌒" })).toHaveCount(2);
  await page.getByRole("button", { name: "4분음표", exact: true }).click();
  await page.getByRole("button", { name: "쉼표 삽입", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 4800, durationTicks: 960 });
  const before = await storedScore(page, id);
  await page.getByRole("button", { name: "선택 쉼표 길이 2분음표", exact: true }).click();
  await expect.poll(() => storedRest(page, id)).toEqual({ startTick: 4800, durationTicks: 1920 });
  await page.reload();
  await expect(page.getByText(/음표 5개/)).toBeVisible();
  await expect(page.locator("button[aria-pressed]", { hasText: "⌒" })).toHaveCount(2);
  await expect(page.getByTestId("staff").locator("svg .vf-stavenote")).toHaveCount(6);
  const after = await storedScore(page, id);
  expect(after.schemaVersion).toBe(2);
  expect(after.parts[0].ties).toEqual(before.parts[0].ties);
  const notes = (score: typeof after) => score.parts[0].measures.flatMap((m: { events: { kind: string }[] }) => m.events).filter((e: { kind: string }) => e.kind === "note");
  expect(notes(after)).toEqual(notes(before));
});
