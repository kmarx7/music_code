import { scoreNoteCount } from "./score-summary";
import { openMode, renameScore } from "./editor-modes";
import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

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
  await expect(scoreNoteCount(page, 0)).toBeVisible();
  await clearScores(page);

  await page.goto("/library");
  await expect(page.getByText("저장된 악보가 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "새 악보", exact: true }).click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]+$/, { timeout: 30_000 });
  const scoreId = new URL(page.url()).pathname.split("/").pop() as string;

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 62" }).click();
  await expect(scoreNoteCount(page, 2)).toBeVisible();

  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "C4", exact: true }).click();
  await expect(page.getByText("선택한 음표 편집")).toBeVisible();
  await page.getByRole("button", { name: "반음 올리기" }).click();
  await expect(page.getByText(/C#4 · /)).toBeVisible();

  await page.getByRole("button", { name: "선택 음표 길이 2분음표" }).click();
  await expect(page.getByText(/1920 ticks/)).toBeVisible();

  await expect(page.getByText("저장됨")).toBeVisible();

  // 이전 저장 상태가 아니라 이번 음정/길이 변경이 실제로 저장됐는지 확인한다.
  await expect.poll(async () => {
    const saved = await storedScore(page, scoreId);
    if (!saved) return null;
    return saved.parts[0].measures.flatMap((measure: { events: { kind: string; pitch: { midi: number }; startTick: number; durationTicks: number }[] }) => measure.events)
      .map((note: { pitch: { midi: number }; startTick: number; durationTicks: number }) => ({
        midi: note.pitch.midi, startTick: note.startTick, durationTicks: note.durationTicks,
      }));
  }).toEqual([
    { midi: 61, startTick: 0, durationTicks: 1920 },
    { midi: 62, startTick: 1920, durationTicks: 960 },
  ]);

  await page.reload();
  await expect(scoreNoteCount(page, 2)).toBeVisible();
  await openMode(page, "다듬기");
  const restoredNote = page.getByRole("button", { name: "C#4", exact: true });
  await restoredNote.click();
  await expect(restoredNote).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/1920 ticks/)).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("link", { name: "열기" })).toHaveCount(1);
  await page.getByRole("link", { name: "열기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${scoreId}$`));
  await expect(scoreNoteCount(page, 2)).toBeVisible();

  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("모바일 레이아웃에서 가로 스크롤 없이 입력·저장된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor/e2e-mobile");

  await expect(scoreNoteCount(page, 0)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await expect(scoreNoteCount(page, 1)).toBeVisible();
  await expect(page.getByText("저장됨")).toBeVisible();
});

test("키보드 입력과 포커스·접근성 상태가 동작한다", async ({ page }) => {
  await page.goto("/editor/e2e-keyboard");
  await expect(scoreNoteCount(page, 0)).toBeVisible();

  await page.keyboard.press("a");
  await expect(scoreNoteCount(page, 1)).toBeVisible();

  const c4 = page.getByRole("button", { name: "MIDI 60" });
  await c4.focus();
  await expect(c4).toBeFocused();

  await openMode(page, "다듬기");
  const chip = page.locator("button[aria-pressed]").first();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
});

test("마디를 넘는 음표는 분할되어 붙임줄로 표시·저장된다", async ({ page }) => {
  await page.goto("/library");
  await clearScores(page);

  await page.goto("/editor/e2e-tie");
  await expect(scoreNoteCount(page, 0)).toBeVisible();

  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "MIDI 60" }).click();
  await expect(scoreNoteCount(page, 3)).toBeVisible();

  // 4/4 마지막 박(2880)에서 시작하는 2박 음 → 마디 경계에서 분할 + 타이
  await page.getByRole("button", { name: "2분음표" }).click();
  await page.getByRole("button", { name: "MIDI 62" }).click();

  await expect(scoreNoteCount(page, 5)).toBeVisible();
  await openMode(page, "다듬기");
  const tiedChips = page.locator("button[aria-pressed]", { hasText: "⌒" });
  await expect(tiedChips).toHaveCount(2);
  await expect(page.locator("svg")).toHaveCount(1);

  await tiedChips.first().click();
  await expect(page.getByText(/붙임줄 연결됨/)).toBeVisible();
  await expect(page.getByText("저장됨")).toBeVisible();

  await page.reload();
  await expect(scoreNoteCount(page, 5)).toBeVisible();
  await openMode(page, "다듬기");
  await expect(page.locator("button[aria-pressed]", { hasText: "⌒" })).toHaveCount(2);
});

test("제목 변경·Undo/Redo → JSON 다운로드 → 새 악보로 복원·오류 파일 거부", async ({ page }) => {
  const scoreId = "e2e-backup";
  await page.goto(`/editor/${scoreId}`);
  await expect(page).toHaveURL(new RegExp(`/editor/${scoreId}$`));
  await expect(scoreNoteCount(page, 0)).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "MIDI 60" }).click();
  await page.getByRole("button", { name: "2분음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62" }).click();
  await expect(scoreNoteCount(page, 5)).toBeVisible();

  const title = page.getByRole("textbox", { name: "악보 제목" });
  await renameScore(page, "백업 연습곡");
  await expect(page.getByRole("heading", { name: "백업 연습곡", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "새 악보", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "이름 바꾸기", exact: true }).click();
  await expect(title).toHaveValue("백업 연습곡");
  await title.fill("   ");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toHaveText("제목을 입력해 주세요.");
  await expect(scoreNoteCount(page, 5)).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await openMode(page, "내보내기");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const download = await downloadEvent;
  // The app hands the browser an NFC name; WebKit on macOS reports it decomposed (NFD). Compare the same text in one form.
  expect(download.suggestedFilename().normalize("NFC")).toBe("백업 연습곡.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  const backup = JSON.parse(buffer.toString("utf8"));
  expect(backup.id).toBe(scoreId);
  expect(backup.title).toBe("백업 연습곡");
  expect(backup.schemaVersion).toBe(3);
  expect(backup.parts[0].ties).toHaveLength(1);

  // JSON 다운로드는 저장 완료 신호가 아니다. 실제 저장본과 다운로드 내용을 비교한다.
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  await expect.poll(() => storedScore(page, scoreId)).toEqual(backup);
  await page.getByRole("link", { name: "악보함 / JSON 가져오기" }).click();
  const source = page.getByRole("link", { name: "백업 연습곡", exact: true })
    .and(page.locator(`a[href="/editor/${scoreId}"]`));
  await expect(source).toBeVisible();
  await page.locator("#score-import").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer });
  await expect(page.getByRole("status")).toContainText("새 악보로 가져왔습니다");
  const restored = page.getByRole("link", { name: "백업 연습곡", exact: true });
  await expect(restored).toHaveCount(2);
  const restoredHref = await page.locator('a:not([href="/editor/e2e-backup"])').filter({ hasText: /^백업 연습곡$/ }).getAttribute("href");
  expect(restoredHref).not.toBe("/editor/e2e-backup");

  await page.locator("#score-import").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
  await expect(page.getByRole("status")).toContainText("가져오기 실패");
  await expect(page.getByRole("link", { name: "백업 연습곡", exact: true })).toHaveCount(2);
  await page.goto(restoredHref!);
  await expect(page.getByRole("heading", { name: "백업 연습곡", exact: true })).toBeVisible();
  await openMode(page, "다듬기");
  await expect(page.locator("button[aria-pressed]", { hasText: "⌒" })).toHaveCount(2);
  await page.reload();
  await expect(scoreNoteCount(page, 5)).toBeVisible();
  await expect(page.getByRole("heading", { name: "백업 연습곡", exact: true })).toBeVisible();
});
