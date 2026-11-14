import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";
import { renameScore } from "./editor-modes";

const tab = (page: Page, name: string) => page.getByRole("tablist", { name: "작업 모드" }).getByRole("tab", { name, exact: true });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("모바일 편집기(P6-03 → Phase 7 작업 모드)", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("휴대폰 폭에서도 건반은 가온 도(C4) 둘레부터 보인다: 홈 '피아노로 시작'과 탭 전환 뒤", async ({ page }) => {
    const keyInView = async (midi: number) => page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).evaluate((key) => {
      const box = key.getBoundingClientRect(), strip = key.parentElement!.parentElement!.getBoundingClientRect();
      return box.left >= strip.left && box.right <= strip.right;
    });
    await page.goto("/");
    await page.getByRole("link", { name: "피아노로 시작", exact: true }).tap();
    await page.getByRole("button", { name: "만들기", exact: true }).tap();
    await page.waitForURL(/\?start=piano$/);
    await expect.poll(() => keyInView(60)).toBe(true);
    expect(await keyInView(21)).toBe(false);
    // Still there after visiting another tab (the strip is hidden, not remounted).
    await tab(page, "내보내기").tap();
    await tab(page, "입력").tap();
    expect(await keyInView(60)).toBe(true);
  });

  test("악보가 첫 화면에 보이고, 아래 고정 모드 4개로 입력·다듬기·연습·내보내기를 오가며 상태를 잃지 않는다", async ({ page }) => {
    const id = "e2e-mobile-editor";
    await page.goto(`/editor/${id}`);
    const staff = page.getByTestId("editor-content").getByTestId("staff");
    await expect(staff.locator("svg")).toBeVisible();
    // The staff starts within the first screen; the mode bar is fixed to the bottom edge for the thumb (A-1 decision 3).
    const staffTop = await staff.evaluate((element) => element.getBoundingClientRect().top);
    expect(staffTop).toBeLessThan(844);
    const tabs = page.getByRole("tablist", { name: "작업 모드" });
    await expect(tabs.getByRole("tab")).toHaveText(["입력", "다듬기", "연습", "내보내기"]);
    await expect(tab(page, "입력")).toHaveAttribute("aria-selected", "true");
    const bar = await tabs.evaluate((element) => ({ bottom: element.getBoundingClientRect().bottom, position: getComputedStyle(element).position }));
    expect(bar.position).toBe("fixed");
    expect(Math.round(bar.bottom)).toBe(844);

    // 입력: durations, piano and recording are here; the other modes' panels are hidden.
    await expect(page.getByTestId("recording-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "4분음표", exact: true }).tap();
    for (const key of [60, 62, 64, 67]) {
      const button = page.getByRole("button", { name: `MIDI ${key}`, exact: true });
      await button.scrollIntoViewIfNeeded(); await button.tap();
    }
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(4);
    expect(await noOverflow(page)).toBe(true);

    // 연습: start at 50%, leave the mode while playing, come back: still playing at 50%.
    await tab(page, "연습").tap();
    await expect(page.getByTestId("recording-panel")).toBeHidden();
    await page.getByRole("button", { name: "50%", exact: true }).tap();
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    const position = page.getByTestId("playback-position");
    await expect.poll(async () => Number(await position.getAttribute("data-tick"))).toBeGreaterThan(0);
    expect(await noOverflow(page)).toBe(true);
    await tab(page, "내보내기").tap();
    await tab(page, "연습").tap();
    await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "50");
    await expect(position).toContainText("재생 중");
    await page.getByRole("button", { name: "Stop", exact: true }).tap();

    // Tapping a note on the staff opens its editor in the 다듬기 mode; transposition lives there too. Labels sit above the staff.
    await tab(page, "입력").tap();
    const glyph = staff.locator('[data-event-id]').nth(1);
    await glyph.scrollIntoViewIfNeeded(); await glyph.tap();
    await expect(tab(page, "다듬기")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("선택한 음표 편집")).toBeVisible();
    await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
    await expect(staff.getByTestId("note-label")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "조옮김", exact: true })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);

    // 내보내기: exports. The title is renamed from the header in every mode.
    await tab(page, "내보내기").tap();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "MIDI", exact: true }).tap();
    expect((await download).suggestedFilename().normalize("NFC")).toBe("새 악보.mid");
    expect(await noOverflow(page)).toBe(true);

    await renameScore(page, "휴대폰 악보");
    await expect(page.getByRole("heading", { name: "휴대폰 악보", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).tap();

    // Undo/Redo stay reachable from every mode.
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(3);
  });

  test("다듬기(P2 시안 B): 도구는 닫힌 줄로 한 화면에, 고른 음 편집은 모드 막대 위에 고정되어 악보가 보인다", async ({ page }) => {
    const id = "e2e-mobile-refine";
    await page.goto(`/editor/${id}`);
    for (const key of [60, 62, 64, 67]) {
      const button = page.getByRole("button", { name: `MIDI ${key}`, exact: true });
      await button.scrollIntoViewIfNeeded(); await button.tap();
    }
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(4);
    const before = await storedScore(page, id);
    await tab(page, "다듬기").tap();

    // Closed rows with a summary; their tools are hidden until opened, and the mode fits about one screen.
    const row = (title: string) => page.locator(".refine-toggle").filter({ has: page.locator(".refine-toggle-title", { hasText: title }) });
    for (const title of ["음표 목록", "구간 편집", "악보 설정"]) await expect(row(title)).toHaveAttribute("aria-expanded", "false");
    await expect(row("음표 목록")).toContainText("4개");
    await expect(row("악보 설정")).toContainText("템포 120 · 4/4박자");
    await expect(page.getByLabel("구간 첫 마디", { exact: true })).toBeHidden();
    await expect(page.getByLabel("기본 템포 (BPM)", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "조옮김", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(844 * 1.4);
    await row("구간 편집").tap();
    await expect(row("구간 편집")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("구간 첫 마디", { exact: true })).toBeVisible();
    await row("구간 편집").tap();
    await expect(page.getByLabel("구간 첫 마디", { exact: true })).toBeHidden();

    // Tapping a note docks its editor just above the mode bar; the staff stays on screen.
    const staff = page.getByTestId("editor-content").getByTestId("staff");
    await staff.locator("[data-event-id]").nth(1).tap();
    const dock = page.locator(".refine-selection");
    await expect(dock).toContainText("D4");
    const geometry = await page.evaluate(() => {
      const dockBox = document.querySelector(".refine-selection")!.getBoundingClientRect();
      const bar = document.querySelector('[role="tablist"][aria-label="작업 모드"]')!.getBoundingClientRect();
      const staffBox = document.querySelector('[data-testid="editor-content"] [data-testid="staff"]')!.getBoundingClientRect();
      return { position: getComputedStyle(document.querySelector(".refine-selection")!).position,
        dockBottom: dockBox.bottom, dockTop: dockBox.top, barTop: bar.top, staffTop: staffBox.top };
    });
    expect(geometry.position).toBe("fixed");
    expect(Math.abs(geometry.dockBottom - geometry.barTop)).toBeLessThanOrEqual(1);
    expect(geometry.staffTop).toBeLessThan(geometry.dockTop);
    // Step through the notes without the list, edit, then close.
    await page.getByRole("button", { name: "다음 음표·쉼표", exact: true }).tap();
    await expect(dock).toContainText("E4");
    await expect(dock).toContainText("3 / 4");
    await page.getByRole("button", { name: "이전 음표·쉼표", exact: true }).tap();
    await expect(dock).toContainText("D4");
    await page.getByRole("button", { name: "반음 올리기", exact: true }).tap();
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events
      .map((event: { kind: string; pitch?: { midi: number } }) => event.kind === "note" ? event.pitch?.midi : null)).toEqual([60, 63, 64, 67]);
    await page.getByRole("button", { name: "선택한 음표·쉼표 편집 닫기", exact: true }).tap();
    await expect(dock).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    // Open/closed rows and the dock are UI state: a reload starts closed, and only the pitch edit was stored.
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures).toEqual(before?.parts[0].measures);
  });
});

test("데스크톱도 같은 4모드: 악보 아래 모드 막대, 한 번에 한 모드의 도구, 화살표 키 이동, 모드는 저장하지 않음", async ({ page }) => {
  const id = "e2e-desktop-modes";
  await page.goto(`/editor/${id}`);
  const tabs = page.getByRole("tablist", { name: "작업 모드" });
  await expect(tabs.getByRole("tab")).toHaveText(["입력", "다듬기", "연습", "내보내기"]);
  const staffBottom = await page.getByTestId("editor-content").getByTestId("staff").evaluate((element) => element.getBoundingClientRect().bottom);
  expect(await tabs.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(staffBottom);
  await expect(page.getByTestId("recording-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeHidden();
  await expect(page.getByLabel("악보 라벨", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures[0].events.length).toBe(1);
  const before = await storedScore(page, id);

  // Keyboard: arrows move between modes and focus follows (WAI-ARIA tabs); only the chosen mode's tools show.
  await tab(page, "입력").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "다듬기")).toBeFocused();
  await expect(tab(page, "다듬기")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "조옮김", exact: true })).toBeVisible();
  await expect(page.getByTestId("recording-panel")).toBeHidden();
  // Desktop keeps every 다듬기 tool open: the phone's closed rows and dock controls are not shown (P2 option B).
  await expect(page.locator(".refine-toggle").first()).toBeHidden();
  await expect(page.getByLabel("구간 첫 마디", { exact: true })).toBeVisible();
  await expect(page.getByLabel("기본 템포 (BPM)", { exact: true })).toBeVisible();
  await page.keyboard.press("End");
  await expect(tab(page, "내보내기")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "MIDI", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "입력")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tab(page, "내보내기")).toHaveAttribute("aria-selected", "true");

  // The mode is UI state: nothing is written, and a reload opens the input mode again.
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect(await storedScore(page, id)).toEqual(before);
  await page.reload();
  await expect(tab(page, "입력")).toHaveAttribute("aria-selected", "true");
});
