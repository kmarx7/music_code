import { expect, type Page } from "@playwright/test";

/** Editor work modes (Phase 7 decision 4). Tests switch modes the way a user does: through the mode tabs. */
export type EditorModeName = "입력" | "다듬기" | "연습" | "내보내기";

export async function openMode(page: Page, name: EditorModeName): Promise<void> {
  const tab = page.getByRole("tablist", { name: "작업 모드" }).getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Renames through the header's "이름 바꾸기" (A-1 decision 2). */
export async function renameScore(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "이름 바꾸기", exact: true }).click();
  await page.getByLabel("악보 제목", { exact: true }).fill(title);
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
}

/** Opens the input mode's "허밍 추가" steps (A-5): the score's own settings are step ①, so it lands on ② 마이크. */
export async function openHummingAdd(page: Page): Promise<void> {
  const panel = page.getByTestId("recording-panel");
  await panel.getByRole("button", { name: "허밍 추가", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "mic");
}

/**
 * Opens a 다듬기 tool group by its row (P2 option B). On phones the groups start closed; on wider screens the row
 * is hidden and the content always shows, so this does nothing there.
 */
export async function openRefineSection(page: Page, title: string): Promise<void> {
  const row = page.locator(".refine-toggle").filter({ has: page.locator(".refine-toggle-title", { hasText: title }) });
  if (!(await row.isVisible())) return;
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
}
