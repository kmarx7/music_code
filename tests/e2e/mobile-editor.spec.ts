import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("모바일 편집기(P6-03)", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("휴대폰 폭에서도 건반은 가온 도(C4) 둘레부터 보인다: 홈 '피아노로 시작'과 탭 전환 뒤", async ({ page }) => {
    const keyInView = async (midi: number) => page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).evaluate((key) => {
      const box = key.getBoundingClientRect(), strip = key.parentElement!.parentElement!.getBoundingClientRect();
      return box.left >= strip.left && box.right <= strip.right;
    });
    await page.goto("/");
    await page.getByRole("button", { name: "피아노로 시작", exact: true }).tap();
    await page.waitForURL(/\?start=piano$/);
    await expect.poll(() => keyInView(60)).toBe(true);
    expect(await keyInView(21)).toBe(false);
    // Still there after visiting another tab (the strip is hidden, not remounted).
    await tab(page, "파일").tap();
    await tab(page, "입력").tap();
    expect(await keyInView(60)).toBe(true);
  });

  test("악보가 첫 화면에 보이고, 탭 4개로 입력·재생·편집·파일을 오가며 상태를 잃지 않는다", async ({ page }) => {
    const id = "e2e-mobile-editor";
    await page.goto(`/editor/${id}`);
    const staff = page.getByTestId("editor-content").getByTestId("staff");
    await expect(staff.locator("svg")).toBeVisible();
    // The staff starts within the first screen, above the tab bar.
    const staffTop = await staff.evaluate((element) => element.getBoundingClientRect().top);
    expect(staffTop).toBeLessThan(844);
    const tabs = page.getByRole("tablist", { name: "편집기 영역" });
    await expect(tabs.getByRole("tab")).toHaveText(["입력", "재생·연습", "편집", "파일"]);
    await expect(tab(page, "입력")).toHaveAttribute("aria-selected", "true");
    const tabsTop = await tabs.evaluate((element) => element.getBoundingClientRect().top);
    expect(tabsTop).toBeGreaterThan(staffTop);

    // 입력: durations, piano and recording are here; other tabs' panels are hidden.
    await expect(page.getByTestId("recording-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "4분음표", exact: true }).tap();
    for (const key of [60, 62, 64, 67]) {
      const button = page.getByRole("button", { name: `MIDI ${key}`, exact: true });
      await button.scrollIntoViewIfNeeded(); await button.tap();
    }
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(4);
    expect(await noOverflow(page)).toBe(true);

    // 재생·연습: start at 50%, leave the tab while playing, come back: still playing at 50%.
    await tab(page, "재생·연습").tap();
    await expect(page.getByTestId("recording-panel")).toBeHidden();
    await page.getByRole("button", { name: "50%", exact: true }).tap();
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    const position = page.getByTestId("playback-position");
    await expect.poll(async () => Number(await position.getAttribute("data-tick"))).toBeGreaterThan(0);
    expect(await noOverflow(page)).toBe(true);
    await tab(page, "파일").tap();
    await tab(page, "재생·연습").tap();
    await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "50");
    await expect(position).toContainText("재생 중");
    await page.getByRole("button", { name: "Stop", exact: true }).tap();

    // Tapping a note on the staff opens its editor in the 편집 tab; labels and transposition live there too.
    await tab(page, "입력").tap();
    const glyph = staff.locator('[data-event-id]').nth(1);
    await glyph.scrollIntoViewIfNeeded(); await glyph.tap();
    await expect(tab(page, "편집")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("선택한 음표 편집")).toBeVisible();
    await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
    await expect(staff.getByTestId("note-label")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "조옮김", exact: true })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);

    // 파일: title and exports.
    await tab(page, "파일").tap();
    await expect(page.getByLabel("악보 제목", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "MIDI", exact: true }).tap();
    expect((await download).suggestedFilename().normalize("NFC")).toBe("새 악보.mid");
    expect(await noOverflow(page)).toBe(true);

    // Undo/Redo stay reachable from every tab.
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(3);
  });
});

test("데스크톱은 탭 없이 모든 영역을 그대로 보여 준다", async ({ page }) => {
  await page.goto("/editor/e2e-desktop-no-tabs");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByTestId("recording-panel")).toBeVisible();
  await expect(page.getByLabel("악보 제목", { exact: true })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "편집기 영역" })).toBeHidden();
});
