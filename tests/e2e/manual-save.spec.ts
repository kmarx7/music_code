import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

type WriteAudit = { hold: boolean; writes: number; active: number; maximum: number };
type AuditWindow = Window & { manualWriteAudit?: WriteAudit; restoreManualWrites?: () => void };
async function rename(page: Page, title: string) {
  await page.getByRole("textbox", { name: "악보 제목", exact: true }).fill(title);
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
}
async function rawRecord(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<unknown>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    } finally { db.close(); }
  }, id);
}

test("수동 저장은 디바운스를 기다리지 않고 최신 Score·Undo/Redo를 저장하고 복원한다", async ({ page }) => {
  const id = "e2e-manual-save"; await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  const save = page.getByRole("button", { name: "저장", exact: true });
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await rename(page, "수동 저장 연습곡");
  // The 400ms autosave timer is frozen. Only the explicit save can persist these edits.
  expect((await storedScore(page, id)).title).toBe("새 악보");
  await save.click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  const edited = await storedScore(page, id);
  expect(edited).toMatchObject({ id, title: "수동 저장 연습곡", schemaVersion: 2 });
  expect(edited.parts[0].measures[0].events[0].pitch.midi).toBe(60);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await save.click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  expect((await storedScore(page, id)).title).toBe("새 악보");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await save.click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  expect(await storedScore(page, id)).toEqual(edited);
  await page.clock.resume(); await page.reload();
  await expect(page.getByRole("heading", { name: "수동 저장 연습곡", exact: true })).toBeVisible();
  await expect(page.getByText(/음표 1개/)).toBeVisible();
  expect(await storedScore(page, id)).toEqual(edited);
});

test("저장 중 연속 클릭·추가 편집은 한 대기열에서 최신 제목까지 저장한다", async ({ page }) => {
  const id = "e2e-manual-save-race"; await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await page.evaluate((scoreId) => {
    const audit: WriteAudit = { hold: true, writes: 0, active: 0, maximum: 0 };
    (window as AuditWindow).manualWriteAudit = audit;
    const original = IDBObjectStore.prototype.put;
    const seen = new WeakSet<IDBTransaction>();
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      const request = original.apply(this, args);
      if (this.name !== "scores" || args[0]?.id !== scoreId) return request;
      audit.writes += 1;
      if (!seen.has(this.transaction)) {
        seen.add(this.transaction); audit.active += 1; audit.maximum = Math.max(audit.maximum, audit.active);
        this.transaction.addEventListener("complete", () => { audit.active -= 1; });
        this.transaction.addEventListener("abort", () => { audit.active -= 1; });
      }
      const read = this.get.bind(this);
      const deadline = performance.now() + 15000;
      request.addEventListener("success", () => {
        // Keep the actual readwrite transaction open until the test releases it.
        function keepAlive() {
          if (!audit.hold || performance.now() >= deadline) return;
          read(scoreId).addEventListener("success", keepAlive);
        }
        keepAlive();
      });
      return request;
    };
    (window as AuditWindow).restoreManualWrites = () => { audit.hold = false; IDBObjectStore.prototype.put = original; };
  }, id);
  try {
    await rename(page, "저장 중 첫 값");
    const save = page.getByRole("button", { name: "저장", exact: true });
    await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
    await expect.poll(() => page.evaluate(() => (window as AuditWindow).manualWriteAudit!.writes)).toBe(1);
    await expect(save).toBeDisabled();
    await rename(page, "저장 중 마지막 값");
    await expect(page.getByTestId("manual-save-feedback")).toContainText("저장 중");
    await expect(page.getByTestId("manual-save-feedback")).not.toContainText("완료");
    await page.evaluate(() => { (window as AuditWindow).manualWriteAudit!.hold = false; });
    await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
    expect(await storedScore(page, id)).toMatchObject({ id, title: "저장 중 마지막 값" });
    const audit = await page.evaluate(() => (window as AuditWindow).manualWriteAudit!);
    expect(audit.writes).toBe(2); expect(audit.maximum).toBe(1);
  } finally { await page.evaluate(() => (window as AuditWindow).restoreManualWrites?.()); }
});

test("수동 저장 트랜잭션 실패는 원시 레코드를 보존하고 재시도·백업을 안내한다", async ({ page }) => {
  const id = "e2e-manual-save-failure"; await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  const baseline = await rawRecord(page, id);
  await page.evaluate((scoreId) => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      const request = original.apply(this, args);
      if (this.name === "scores" && args[0]?.id === scoreId) request.addEventListener("success", () => request.transaction!.abort());
      return request;
    };
    (window as AuditWindow).restoreManualWrites = () => { IDBObjectStore.prototype.put = original; };
  }, id);
  await rename(page, "저장 실패해도 남는 편집");
  const save = page.getByRole("button", { name: "저장", exact: true }); await save.click();
  await expect(page.getByTestId("manual-save-feedback")).toContainText("다시 시도");
  await expect(page.getByTestId("manual-save-feedback")).toContainText("JSON 백업");
  await expect(save).toBeEnabled();
  expect(await rawRecord(page, id)).toEqual(baseline);
  await expect(page.getByRole("heading", { name: "저장 실패해도 남는 편집", exact: true })).toBeVisible();
  await page.evaluate(() => (window as AuditWindow).restoreManualWrites?.());
  await save.click(); await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
  expect((await storedScore(page, id)).title).toBe("저장 실패해도 남는 편집");
  await page.reload();
  await expect(page.getByRole("heading", { name: "저장 실패해도 남는 편집", exact: true })).toBeVisible();
});

test.describe("모바일 수동 저장", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("터치 저장 버튼으로 입력 내용을 저장·복원하며 가로 넘침이 없다", async ({ page }) => {
    const id = "e2e-manual-save-touch"; await page.goto(`/editor/${id}`);
    await page.getByRole("button", { name: "MIDI 60", exact: true }).tap();
    const save = page.getByRole("button", { name: "저장", exact: true }); await save.tap();
    await expect(page.getByTestId("manual-save-feedback")).toContainText("저장이 완료");
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const saved = await storedScore(page, id);
    expect(saved.parts[0].measures[0].events[0].pitch.midi).toBe(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload(); await expect(page.getByText(/음표 1개/)).toBeVisible();
    expect(await storedScore(page, id)).toEqual(saved);
  });
});
