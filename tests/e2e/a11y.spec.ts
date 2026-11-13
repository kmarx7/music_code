import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

test("접근성(axe, WCAG 2.2 AA): 홈·악보함", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-recent")).not.toContainText("불러오는 중");
  expect(blocking(await audit(page, "home"))).toEqual([]);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  expect(blocking(await audit(page, "library"))).toEqual([]);
});

test("접근성(axe, WCAG 2.2 AA): 편집기·조옮김 미리보기·인쇄 화면", async ({ page }) => {
  const id = "e2e-a11y-editor";
  await editorWithNotes(page, id);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  expect(blocking(await audit(page, "editor"))).toEqual([]);
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  await expect(page.getByTestId("transpose-preview")).toBeVisible();
  expect(blocking(await audit(page, "transpose"))).toEqual([]);
  await page.goto(`/print/${id}`);
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  expect(blocking(await audit(page, "print"))).toEqual([]);
});

test.describe("접근성 모바일", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("접근성(axe, WCAG 2.2 AA): 모바일 편집기 탭 4개", async ({ page }) => {
    await editorWithNotes(page, "e2e-a11y-mobile");
    for (const name of ["입력", "재생·연습", "편집", "파일"]) {
      await page.getByRole("tab", { name, exact: true }).tap();
      expect(blocking(await audit(page, `mobile ${name}`)), name).toEqual([]);
    }
  });
});
