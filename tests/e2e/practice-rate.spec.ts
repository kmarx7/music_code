import { expect, test } from "@playwright/test";
import { storedRow, storedScore } from "./storage";

test("연습 속도: 기본 100%·프리셋·키보드 조작·재생 중 변경·무저장·새로고침 초기화", async ({ page }) => {
  const id = "e2e-practice-rate";
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(2);
  const rowBefore = await storedRow(page, id);
  expect((await storedScore(page, id)).tempoBpm).toBe(120);

  const rate = page.getByTestId("practice-rate");
  const slider = page.getByLabel("연습 속도", { exact: true });
  const cursor = page.getByTestId("playback-position");
  await expect(rate).toHaveAttribute("data-rate", "100");
  await expect(rate).toContainText("재생 120 BPM");
  await expect(slider).toHaveAttribute("min", "25");
  await expect(slider).toHaveAttribute("max", "150");
  await expect(slider).toHaveAttribute("step", "5");

  // Preset: 120 BPM at 50% is an effective 60 BPM while the score tempo field stays 120.
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await expect(rate).toHaveAttribute("data-rate", "50");
  await expect(rate).toContainText("재생 60 BPM");
  await expect(rate).toContainText("악보 템포 120 BPM");
  await expect(page.getByRole("button", { name: "50%", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("기본 템포 (BPM)", { exact: true })).toHaveValue("120");

  // Keyboard: 5% steps and the 25%/150% bounds.
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(rate).toHaveAttribute("data-rate", "55");
  await page.keyboard.press("Home");
  await expect(rate).toHaveAttribute("data-rate", "25");
  await page.keyboard.press("ArrowLeft");
  await expect(rate).toHaveAttribute("data-rate", "25");
  await page.keyboard.press("End");
  await expect(rate).toHaveAttribute("data-rate", "150");
  await expect(rate).toContainText("재생 180 BPM");

  // Changing the rate while playing continues from the current tick instead of restarting.
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute("data-tick"))).toBeGreaterThan(200);
  const tickBefore = Number(await cursor.getAttribute("data-tick"));
  await page.getByRole("button", { name: "125%", exact: true }).click();
  await expect(rate).toHaveAttribute("data-rate", "125");
  await expect(cursor).toContainText("재생 중");
  expect(Number(await cursor.getAttribute("data-tick"))).toBeGreaterThanOrEqual(tickBefore);
  await expect.poll(async () => Number(await cursor.getAttribute("data-tick"))).toBeGreaterThan(tickBefore + 400);
  await expect(page.getByTestId("staff").locator('[data-event-id][data-playing="true"]')).toHaveCount(1);

  // Paused: the tick is kept, and resume continues at the new rate.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(cursor).toContainText("일시정지");
  const paused = Number(await cursor.getAttribute("data-tick"));
  await page.getByRole("button", { name: "75%", exact: true }).click();
  expect(Number(await cursor.getAttribute("data-tick"))).toBe(paused);
  await expect(cursor).toContainText("일시정지");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute("data-tick"))).toBeGreaterThan(paused);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(cursor).toHaveAttribute("data-tick", "0");
  await expect(page.locator('[data-playing="true"]')).toHaveCount(0);
  await expect(rate).toHaveAttribute("data-rate", "75");

  // Practice rate is runtime-only: no command, no write, no revision bump, no undo entry.
  await page.waitForTimeout(800); // longer than the 400 ms autosave debounce
  expect(await storedRow(page, id)).toEqual(rowBefore);

  await page.reload();
  await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
  await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "100");
  expect(await storedRow(page, id)).toEqual(rowBefore);
});

test("연습 속도: 모바일 터치로 프리셋을 선택하고 재생한다", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto("/editor/e2e-practice-rate-touch");
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    await page.getByRole("tab", { name: "편집", exact: true }).tap(); // phone layout: P6-03 tabs
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "재생·연습", exact: true }).tap(); // phone layout: P6-03 tabs
    await page.getByRole("button", { name: "50%", exact: true }).tap();
    await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "50");
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await expect.poll(async () => Number(await page.getByTestId("playback-position").getAttribute("data-tick"))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Stop", exact: true }).tap();
    await expect(page.getByTestId("playback-position")).toHaveAttribute("data-tick", "0");
  } finally { await context.close(); }
});
