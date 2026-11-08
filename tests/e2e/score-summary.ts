import type { Page } from "@playwright/test";

/** The editor's first-Part event count, distinct from whole-score range analysis. */
export function scoreNoteCount(page: Page, count: number) {
  return page.getByTestId("score-summary").filter({ hasText: `음표 ${count}개` });
}
