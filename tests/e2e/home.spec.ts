import { expect, test, type Page } from "@playwright/test";

async function scoreCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      if (!db.objectStoreNames.contains("scores")) return 0;
      const request = db.transaction("scores", "readonly").objectStore("scores").getAll();
      const rows = await new Promise<{ deleted?: boolean; tombstone?: boolean }[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return rows.filter((row) => !row.deleted && !row.tombstone).length;
    } finally { db.close(); }
  });
}

test("홈 첫 방문: 소개·시작 버튼·로컬 저장 안내, 최근 악보는 비어 있고 고정 데모 링크는 없다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "허밍으로 시작", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "피아노로 시작", exact: true })).toBeEnabled();
  await expect(page.getByTestId("home-recent")).toContainText("아직 만든 악보가 없습니다");
  await expect(page.getByText("이 브라우저에만 저장")).toBeVisible();
  await expect(page.locator('a[href="/editor/demo-score"]')).toHaveCount(0);
  await expect(page.getByText("Phase 1")).toHaveCount(0);
});

test("피아노로 시작: 새 악보를 한 번만 만들고 편집기의 건반으로 간다", async ({ page }) => {
  await page.goto("/");
  const before = await scoreCount(page);
  const start = page.getByRole("button", { name: "피아노로 시작", exact: true });
  await start.dblclick();
  await page.waitForURL(/\/editor\/[^/?]+\?start=piano$/);
  await expect(page.getByRole("button", { name: "MIDI 60", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "MIDI 60", exact: true })).toBeInViewport();
  expect(await scoreCount(page)).toBe(before + 1);
});

test("허밍으로 시작: 새 악보를 만들고 녹음 패널로 이동해 동의 체크에 포커스", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "허밍으로 시작", exact: true }).click();
  await page.waitForURL(/\/editor\/[^/?]+\?start=hum$/);
  const panel = page.getByTestId("recording-panel");
  await expect(panel).toBeInViewport();
  await expect(panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다")).toBeFocused();
  // Nothing is recorded until the user consents and presses start.
  await expect(panel).toHaveAttribute("data-state", "idle");
});

test("홈 최근 악보: 최근 수정한 3개를 보여 주고 열 수 있으며 전체 목록 링크가 있다", async ({ page }) => {
  for (const title of ["첫째", "둘째", "셋째", "넷째"]) {
    await page.goto("/");
    await page.getByRole("button", { name: "피아노로 시작", exact: true }).click();
    await page.waitForURL(/\/editor\//);
    await page.getByLabel("악보 제목", { exact: true }).fill(title);
    await page.getByRole("button", { name: "제목 변경", exact: true }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  }
  await page.goto("/");
  const recent = page.getByTestId("home-recent").getByRole("listitem");
  await expect(recent).toHaveCount(3);
  await expect(recent.first()).toContainText("넷째");
  await expect(page.getByTestId("home-recent")).not.toContainText("첫째");
  await recent.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "넷째", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "모든 악보 보기", exact: false }).click();
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
});
