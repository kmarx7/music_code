import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openMode, type EditorModeName } from "./editor-modes";

const MODES: readonly EditorModeName[] = ["입력", "다듬기", "연습", "내보내기"];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = result.violations.map((violation) => ({
    id: violation.id, impact: violation.impact, count: violation.nodes.length,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
  }));
  test.info().annotations.push({ type: `axe ${label}`, description: JSON.stringify(summary) });
  console.log(`AXE ${label}`, JSON.stringify(summary));
  return result.violations;
}
// Every impact level counts: the screens were brought to zero violations in P6-04, so any new one is a regression.
const blocking = (violations: Awaited<ReturnType<typeof audit>>) =>
  violations.map((violation) => `${violation.id} [${violation.impact}] (${violation.nodes.length})`);

async function editorWithNotes(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  for (const key of [60, 62, 64, 67]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await expect(page.getByTestId("editor-content").getByTestId("staff").locator("svg")).toBeVisible();
}

test("접근성(axe, WCAG 2.2 AA): 홈·악보함·라이선스", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-recent")).not.toContainText("불러오는 중");
  expect(blocking(await audit(page, "home"))).toEqual([]);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  expect(blocking(await audit(page, "library"))).toEqual([]);
  await page.goto("/licenses");
  await expect(page.getByRole("heading", { name: "오픈소스 라이선스", exact: true })).toBeVisible();
  expect(blocking(await audit(page, "licenses"))).toEqual([]);
});

test("접근성(axe, WCAG 2.2 AA): 새 악보(/new)·허밍 시작(/record) 1·2단계", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("button", { name: "만들기", exact: true })).toBeVisible();
  expect(blocking(await audit(page, "new"))).toEqual([]);
  await page.goto("/record");
  await expect(page.getByTestId("humming-flow")).toHaveAttribute("data-step", "setup");
  expect(blocking(await audit(page, "record setup"))).toEqual([]);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByTestId("humming-flow")).toHaveAttribute("data-step", "mic");
  expect(blocking(await audit(page, "record mic"))).toEqual([]);
});

test("접근성(axe, WCAG 2.2 AA): 편집기·조옮김 미리보기·인쇄 화면", async ({ page }) => {
  const id = "e2e-a11y-editor";
  await editorWithNotes(page, id);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  for (const mode of MODES) {
    await openMode(page, mode);
    expect(blocking(await audit(page, `editor ${mode}`)), mode).toEqual([]);
  }
  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  await expect(page.getByTestId("transpose-preview")).toBeVisible();
  expect(blocking(await audit(page, "transpose"))).toEqual([]);
  await page.goto(`/print/${id}`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  expect(blocking(await audit(page, "print"))).toEqual([]);
});

test.describe("접근성 모바일", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("접근성(axe, WCAG 2.2 AA): 모바일 편집기 작업 모드 4개", async ({ page }) => {
    await editorWithNotes(page, "e2e-a11y-mobile");
    for (const name of MODES) {
      await page.getByRole("tab", { name, exact: true }).tap();
      expect(blocking(await audit(page, `mobile ${name}`)), name).toEqual([]);
    }
  });
});
