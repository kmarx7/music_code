import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

async function rename(page: Page, title: string) {
  await page.getByRole("textbox", { name: "악보 제목", exact: true }).fill(title);
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
}
async function ready(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
}
async function raw(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<{ revision: number; deleted?: boolean; json?: string }>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  }, id);
}
async function freeze(page: Page) {
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
}

test("같은 context 두 탭의 동일 revision 저장은 한 번만 커밋하고 패자의 편집·Undo를 보존한다", async ({ page, context }) => {
  // Deliberately disable advisory notifications: correctness must come from the DB transaction.
  await context.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true }); });
  const id = "e2e-occ-race"; await ready(page, id); const other = await context.newPage(); await ready(other, id);
  await freeze(page); await freeze(other);
  await rename(page, "탭 A 편집"); await rename(other, "탭 B 편집");
  await Promise.all([page, other].map((tab) => tab.getByRole("button", { name: "저장", exact: true }).click()));
  await expect.poll(async () => (await raw(page, id)).revision).toBe(2);
  const winner = (await storedScore(page, id)).title;
  const loser = winner === "탭 A 편집" ? other : page;
  const loserTitle = winner === "탭 A 편집" ? "탭 B 편집" : "탭 A 편집";
  await expect(loser.getByTestId("storage-conflict")).toBeVisible();
  await expect(loser.getByRole("heading", { name: loserTitle, exact: true })).toBeVisible();
  await expect(loser.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  const download = loser.waitForEvent("download");
  await loser.getByRole("button", { name: "현재 내용 JSON 백업", exact: true }).click();
  expect((await download).suggestedFilename().normalize("NFC")).toBe(`${loserTitle}.json`); // WebKit reports NFD
  await loser.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(loser.getByRole("heading", { name: "새 악보", exact: true })).toBeVisible();
  await loser.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(loser.getByRole("heading", { name: loserTitle, exact: true })).toBeVisible();
  await loser.clock.runFor(1000); expect((await raw(page, id)).revision).toBe(2);
  await loser.getByRole("button", { name: "새 악보 ID로 저장", exact: true }).click();
  await expect(loser).not.toHaveURL(new RegExp(`/editor/${id}$`));
  await expect(loser.getByRole("heading", { name: loserTitle, exact: true })).toBeVisible();
  const newId = new URL(loser.url()).pathname.split("/").pop()!;
  expect((await storedScore(loser, newId)).title).toBe(loserTitle);
  expect((await storedScore(page, id)).title).toBe(winner);
});

test("다른 탭의 삭제 알림은 저장을 차단하고 Tombstone은 직접 URL에서도 유지된다", async ({ page, context }) => {
  const id = "e2e-occ-delete"; await ready(page, id);
  const library = await context.newPage(); await library.goto("/library");
  await freeze(page); await rename(page, "삭제 후에도 메모리에 남는 편집");
  library.once("dialog", (dialog) => dialog.accept());
  await library.locator("li").filter({ has: library.locator(`a[href="/editor/${id}"]`) }).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByTestId("storage-conflict")).toContainText("삭제된 악보");
  const tombstone = await raw(page, id); expect(tombstone).toMatchObject({ deleted: true, revision: 2 });
  await page.clock.runFor(1000);
  await expect(page.getByRole("heading", { name: "삭제 후에도 메모리에 남는 편집", exact: true })).toBeVisible();
  const direct = await context.newPage(); await direct.goto(`/editor/${id}`);
  await expect(direct.getByTestId("score-open-error")).toContainText("DELETED");
  await expect(direct.getByRole("button", { name: "저장", exact: true })).toHaveCount(0);
  expect(await raw(direct, id)).toEqual(tombstone);
});

test("오래된 악보함 목록의 삭제는 다른 탭의 최신 저장본을 보존한다", async ({ page, context }) => {
  const id = "e2e-stale-delete"; await ready(page, id);
  const library = await context.newPage(); await library.goto("/library");
  await rename(page, "최신 제목"); await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  const before = await raw(page, id);
  library.once("dialog", (dialog) => dialog.accept());
  await library.locator("li").filter({ has: library.locator(`a[href="/editor/${id}"]`) }).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(library.locator('p[role="status"]')).toContainText("다른 탭");
  expect(await raw(library, id)).toEqual(before);
});

test("동일 내용 저장도 DB revision을 확인하고 확인 후 최신본을 열 수 있다", async ({ page, context }) => {
  await context.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true }); });
  const id = "e2e-noop-revision"; await ready(page, id);
  const other = await context.newPage(); await ready(other, id);
  await rename(other, "외부 최신 제목"); await other.getByRole("button", { name: "저장", exact: true }).click();
  await expect(other.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  await page.getByRole("button", { name: "저장", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId("storage-conflict")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "최신 저장본 열기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "외부 최신 제목", exact: true })).toBeVisible();
  expect((await raw(page, id)).revision).toBe(2);
});

test("수동 저장 오류 뒤 정상 자동 저장은 오래된 실패 안내를 지운다", async ({ page }) => {
  const id = "e2e-save-error-clear"; await ready(page, id); await freeze(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => request.transaction!.abort(), { once: true });
      IDBObjectStore.prototype.put = put; return request;
    };
  });
  const before = await raw(page, id); await rename(page, "첫 실패");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("다시 시도");
  expect(await raw(page, id)).toEqual(before);
  await rename(page, "자동 저장 성공"); await page.clock.runFor(500);
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  await expect(page.getByTestId("manual-save-feedback")).not.toContainText("저장하지 못했습니다");
  expect((await storedScore(page, id)).title).toBe("자동 저장 성공");
});

test("미저장 이탈 안내와 hidden 조기 저장 후 새로고침 복원을 확인한다", async ({ page }) => {
  const id = "e2e-hidden-save"; await ready(page, id); await freeze(page);
  const baseline = await raw(page, id);
  await rename(page, "숨김 전환 최신 편집");
  await expect(page.getByRole("heading", { name: "숨김 전환 최신 편집", exact: true })).toBeVisible();
  const originalDocument = await page.evaluateHandle(() => document);
  // A cancelled navigation has no new load event. Await the reload request and dialog handling,
  // not page.reload()'s navigation completion; unexpected evaluation failures must still fail.
  const dismissed = page.waitForEvent("dialog").then(async (prompt) => {
    expect(prompt.type()).toBe("beforeunload");
    await prompt.dismiss();
  });
  await Promise.all([dismissed, page.evaluate(() => window.location.reload())]);
  expect(await originalDocument.evaluate((original) => original === document)).toBe(true);
  await originalDocument.dispose();
  await expect(page.getByRole("heading", { name: "숨김 전환 최신 편집", exact: true })).toBeVisible();
  expect(await raw(page, id)).toEqual(baseline);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await storedScore(page, id)).title).toBe("숨김 전환 최신 편집");
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  const committed = await raw(page, id);
  expect(committed.revision).toBe(baseline.revision + 1);
  expect(JSON.parse(committed.json!).title).toBe("숨김 전환 최신 편집");
  await page.clock.resume(); await page.reload();
  await expect(page.getByRole("heading", { name: "숨김 전환 최신 편집", exact: true })).toBeVisible();
  expect(await raw(page, id)).toEqual(committed);
});
