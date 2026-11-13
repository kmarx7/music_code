import { expect, test, type Page } from "@playwright/test";
import { storedRow, storedScore } from "./storage";

const tickOf = async (page: Page) => Number(await page.getByTestId("playback-position").getAttribute("data-tick"));

async function fourWholeNotes(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  for (const midi of [60, 62, 64, 67]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(4);
}

test("A–B 반복: 3–4마디를 반복 재생하고 해제·잘못된 구간·편집·무저장·새로고침을 처리한다", async ({ page }) => {
  const id = "e2e-ab-loop";
  await fourWholeNotes(page, id);
  const rowBefore = await storedRow(page, id);
  const loop = page.getByTestId("practice-loop");
  const cursor = page.getByTestId("playback-position");
  const toggle = page.getByLabel("A–B 반복", { exact: true });
  const first = page.getByLabel("반복 첫 마디", { exact: true });
  const last = page.getByLabel("반복 마지막 마디", { exact: true });

  await expect(toggle).not.toBeChecked();
  await expect(loop).toHaveAttribute("data-loop", "off");
  await first.fill("3");
  await last.fill("4");
  await toggle.check();
  await expect(loop).toHaveAttribute("data-loop", "on");
  await expect(loop).toHaveAttribute("data-start-tick", "7680");
  await expect(loop).toHaveAttribute("data-end-tick", "15360");
  await expect(loop).toContainText("3–4마디 반복 중");

  // 150% keeps the test short: one pass of two whole notes at 120 BPM takes about 2.7 seconds.
  await page.getByLabel("연습 속도", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => tickOf(page)).toBeGreaterThan(7680);
  await expect(page.getByRole("button", { name: "E4", exact: true })).toHaveAttribute("data-playing", "true");
  await expect.poll(() => tickOf(page)).toBeGreaterThan(13000);
  await expect(page.getByRole("button", { name: "G4", exact: true })).toHaveAttribute("data-playing", "true");
  // Wrap: the cursor returns to measure 3 and playback never leaves [A, B).
  await expect.poll(() => tickOf(page)).toBeLessThan(10000);
  await expect(cursor).toContainText("재생 중");
  await expect(page.getByRole("button", { name: "E4", exact: true })).toHaveAttribute("data-playing", "true");
  await expect(page.locator('[data-playing="true"]').filter({ hasText: /^(C4|D4)$/ })).toHaveCount(0);
  for (let sample = 0; sample < 20; sample += 1) {
    const tick = await tickOf(page);
    expect(tick).toBeGreaterThanOrEqual(7680);
    expect(tick).toBeLessThan(15360);
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("staff").locator('[data-event-id][data-playing="true"]')).toHaveCount(1);

  // Turning the loop off continues from the current position to the natural end without stuck highlights.
  await toggle.uncheck();
  await expect(loop).toHaveAttribute("data-loop", "off");
  await expect(cursor).toContainText("재생 중");
  await expect(cursor).toContainText("정지", { timeout: 15_000 });
  await expect(cursor).toHaveAttribute("data-tick", "0");
  await expect(page.locator('[data-playing="true"]')).toHaveCount(0);

  // An invalid range is reported and never applied: playback falls back to the whole score.
  await toggle.check();
  await first.fill("5");
  await expect(page.getByTestId("practice-loop-error")).toBeVisible();
  await expect(loop).toHaveAttribute("data-loop", "off");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => tickOf(page)).toBeGreaterThan(0);
  expect(await tickOf(page)).toBeLessThan(7680);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await first.fill("1");
  await last.fill("2");
  await expect(page.getByTestId("practice-loop-error")).toHaveCount(0);
  await expect(loop).toHaveAttribute("data-end-tick", "7680");

  // Leaving the tab stops an endless loop.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => tickOf(page)).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(cursor).toContainText("정지");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator('[data-playing="true"]')).toHaveCount(0);

  // Loop settings are runtime-only: no command, no write, no revision bump.
  await page.waitForTimeout(800);
  expect(await storedRow(page, id)).toEqual(rowBefore);

  // A Score edit stops playback (existing policy) and keeps the still-valid measure range.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => tickOf(page)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "MIDI 69", exact: true }).click();
  await expect(cursor).toContainText("정지");
  await expect(loop).toHaveAttribute("data-loop", "on");
  await expect(loop).toHaveAttribute("data-end-tick", "7680");
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(5);

  await page.reload();
  await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
  await expect(page.getByLabel("A–B 반복", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("반복 첫 마디", { exact: true })).toHaveValue("1");
  await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-loop", "off");
});

test("A–B 반복: 모바일 터치로 켜고 반복 재생·정지한다", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto("/editor/e2e-ab-loop-touch");
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    await page.getByRole("tab", { name: "편집", exact: true }).tap(); // phone layout: P6-03 tabs
    await expect(page.getByRole("button", { name: "C4", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "재생·연습", exact: true }).tap(); // phone layout: P6-03 tabs
    await page.getByLabel("A–B 반복", { exact: true }).tap();
    await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-loop", "on");
    await page.getByLabel("연습 속도", { exact: true }).fill("150");
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await expect.poll(() => tickOf(page)).toBeGreaterThan(2400);
    await expect.poll(() => tickOf(page)).toBeLessThan(1200); // wrapped back into measure 1
    await page.getByRole("button", { name: "Stop", exact: true }).tap();
    await expect(page.getByTestId("playback-position")).toHaveAttribute("data-tick", "0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await context.close(); }
});
