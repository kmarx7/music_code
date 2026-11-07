import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "music-score-platform";
const STORE_NAME = "scores";

async function clearScores(page: Page): Promise<void> {
  await page.evaluate(
    async ({ dbName, storeName }) => {
      const open = indexedDB.open(dbName);
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return;
      }
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      await new Promise((resolve) => {
        tx.oncomplete = () => resolve(null);
        tx.onerror = () => resolve(null);
      });
      db.close();
    },
    { dbName: DB_NAME, storeName: STORE_NAME },
  );
}

test("새 악보 생성 → 건반 입력 → 음표 수정 → 저장 → 새로고침 → 불러오기 → 재생", async ({
  page,
}) => {
  await page.goto("/library");
  await clearScores(page);

  // dev 서버의 첫 컴파일 지연이 검증 실패로 오인되지 않도록 편집기 라우트를 미리 방문한다.
  await page.goto("/editor/e2e-warmup");
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await clearScores(page);

  await page.goto("/library");
  await expect(page.getByText("저장된 악보가 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "새 악보" }).click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]+$/, { timeout: 30_000 });
  const scoreId = new URL(page.url()).pathname.split("/").pop() as string;

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 62" }).click();
  await expect(page.getByText(/음표 2개/)).toBeVisible();

  await page.locator("button[aria-pressed]").first().click();
  await expect(page.getByText("선택한 음표 편집")).toBeVisible();
  await page.getByRole("button", { name: "반음 올리기" }).click();
  await expect(page.getByText(/C#4 · /)).toBeVisible();

  await page.getByRole("button", { name: "선택 음표 길이 2분음표" }).click();
  await expect(page.getByText(/1920 ticks/)).toBeVisible();

  await expect(page.getByText("저장됨")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/음표 2개/)).toBeVisible();
  await page.locator("button[aria-pressed]").first().click();
  await expect(page.getByText(/1920 ticks/)).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("link", { name: "열기" })).toHaveCount(1);
  await page.getByRole("link", { name: "열기" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/editor/${scoreId}$`));
  await expect(page.getByText(/음표 2개/)).toBeVisible();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("모바일 레이아웃에서 가로 스크롤 없이 입력·저장된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/e2e-mobile");

  await expect(page.getByText(/음표 0개/)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await expect(page.getByText(/음표 1개/)).toBeVisible();
  await expect(page.getByText("저장됨")).toBeVisible();
});

test("키보드 입력과 포커스·접근성 상태가 동작한다", async ({ page }) => {
  await page.goto("/editor/e2e-keyboard");
  await expect(page.getByText(/음표 0개/)).toBeVisible();

  await page.keyboard.press("a");
  await expect(page.getByText(/음표 1개/)).toBeVisible();

  const c4 = page.getByRole("button", { name: "MIDI 60" });
  await c4.focus();
  await expect(c4).toBeFocused();

  const chip = page.locator("button[aria-pressed]").first();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
});

test("마디를 넘는 음표는 분할되어 붙임줄로 표시·저장된다", async ({ page }) => {
  await page.goto("/library");
  await clearScores(page);

  await page.goto("/editor/e2e-tie");
  await expect(page.getByText(/음표 0개/)).toBeVisible();

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 60" }).click();
  await expect(page.getByText(/음표 3개/)).toBeVisible();

  // 4/4 마지막 박(2880)에서 시작하는 2박 음 → 마디 경계에서 분할 + 타이
  await page.getByRole("button", { name: "2분음표" }).click();
  await page.getByRole("button", { name: "MIDI 62" }).click();

  await expect(page.getByText(/음표 5개/)).toBeVisible();
  const tiedChips = page.locator("button[aria-pressed]", { hasText: "⌒" });
  await expect(tiedChips).toHaveCount(2);
  await expect(page.locator("svg")).toHaveCount(1);

  await tiedChips.first().click();
  await expect(page.getByText(/붙임줄 연결됨/)).toBeVisible();
  await expect(page.getByText("저장됨")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/음표 5개/)).toBeVisible();
  await expect(page.locator("button[aria-pressed]", { hasText: "⌒" })).toHaveCount(2);
});
