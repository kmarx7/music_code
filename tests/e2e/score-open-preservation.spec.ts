import { expect, test, type Page } from "@playwright/test";
import { openMode, renameScore } from "./editor-modes";
import { tiedScore } from "../fixtures/scores";
import { storedScore } from "./storage";

async function rawRecord(page: Page, id: string, record?: unknown) {
  return page.evaluate(async ({ id, record }) => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onupgradeneeded = () => open.result.createObjectStore("scores", { keyPath: "id" });
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction("scores", record === undefined ? "readonly" : "readwrite");
      const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      const store = tx.objectStore("scores");
      // getAll also works while the test deliberately faults get(id) in the editor.
      const request = record === undefined ? store.getAll() : store.put(record);
      const value = await new Promise<unknown>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await done;
      return record === undefined ? (value as { id: string }[]).find((candidate) => candidate.id === id) : value;
    } finally { db.close(); }
  }, { id, record });
}

async function auditWrites(page: Page, failReadId?: string) {
  const install = (failedId?: string) => {
    const state = window as Window & { scoreWriteCount?: number };
    state.scoreWriteCount = 0;
    const transaction = Object.getOwnPropertyDescriptor(IDBDatabase.prototype, "transaction")!;
    Object.defineProperty(IDBDatabase.prototype, "transaction", { ...transaction, value: function (this: IDBDatabase, ...args: unknown[]) {
      if (args[1] === "readwrite") state.scoreWriteCount = (state.scoreWriteCount ?? 0) + 1;
      return transaction.value.apply(this, args);
    } });
    for (const key of ["put", "add", "delete", "clear"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, key)!;
      Object.defineProperty(IDBObjectStore.prototype, key, { ...descriptor, value: function (this: IDBObjectStore, ...args: unknown[]) {
        state.scoreWriteCount = (state.scoreWriteCount ?? 0) + 1;
        return descriptor.value.apply(this, args);
      } });
    }
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (failedId && this.name === "scores" && key === failedId) throw new Error("E2E IndexedDB read failure");
      return get.call(this, key);
    };
  };
  await page.addInitScript(install, failReadId);
  await page.evaluate(install, failReadId);
}

const failures = [
  { name: "손상 JSON", code: "INVALID_JSON", json: " \n {broken json" },
  { name: "미지원 버전", code: "UNSUPPORTED_SCHEMA", json: JSON.stringify({ ...tiedScore(), schemaVersion: 999 }) },
  { name: "유효성 실패", code: "INVALID_SCORE", json: JSON.stringify({ ...tiedScore(), tempoBpm: 0 }) },
  { name: "중첩 구조 실패", code: "INVALID_SHAPE", json: JSON.stringify({ ...tiedScore(), parts: null }) },
  { name: "원시 레코드 실패", code: "INVALID_RECORD", json: 42 },
  { name: "ID 불일치", code: "INVALID_RECORD", json: JSON.stringify({ ...tiedScore(), id: "another" }) },
  { name: "IndexedDB 읽기 오류", code: "STORAGE_READ_ERROR", json: JSON.stringify(tiedScore()) },
];
for (const failure of failures) {
  test(`${failure.name} 저장본 직접 열기: 원본 불변·편집/자동 저장 미시작`, async ({ page }) => {
    const id = "score-tie";
    await page.goto("/library");
    const record = { id, updatedAt: "original metadata", json: failure.json, recovery: { untouched: true } };
    await rawRecord(page, id, record);
    await auditWrites(page, failure.code === "STORAGE_READ_ERROR" ? id : undefined);
    await page.clock.install();
    await page.goto(`/editor/${id}`);
    await expect(page.getByTestId("score-open-error")).toBeVisible();
    await expect(page.getByTestId("score-open-error").locator('p[role="alert"]')).toContainText(failure.code);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("staff")).toHaveCount(0);
    // Advance beyond debounce to detect an accidentally started autosave.
    await page.clock.runFor(1000);
    expect(await rawRecord(page, id)).toEqual(record);
    expect(await page.evaluate(() => (window as Window & { scoreWriteCount?: number }).scoreWriteCount)).toBe(0);
    await page.getByRole("link", { name: "악보함으로 돌아가기", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await page.clock.runFor(1000);
    expect(await rawRecord(page, id)).toEqual(record);
    expect(await page.evaluate(() => (window as Window & { scoreWriteCount?: number }).scoreWriteCount)).toBe(0);
  });
}

for (const version of [1, 2]) {
  test(`정상 v${version} 직접 열기: 읽기 원본 보존 및 정상 편집 저장`, async ({ page }) => {
    await page.goto("/library");
    const score = tiedScore();
    if (version === 1) score.parts[0].ties = [];
    const source = version === 1 ? { ...score, schemaVersion: 1, parts: score.parts.map((part) => Object.fromEntries(Object.entries(part).filter(([key]) => key !== "ties"))) } : score;
    const original = { id: score.id, updatedAt: score.updatedAt, json: JSON.stringify(source), extra: "keep-on-read" };
    await rawRecord(page, score.id, original);
    await auditWrites(page);
    await page.clock.install();
    await page.goto(`/editor/${score.id}`);
    await expect(page.getByRole("heading", { name: score.title, exact: true })).toBeVisible();
    await expect(page.getByTestId("staff").locator("svg")).toHaveCount(1);
    await page.clock.runFor(1000);
    expect(await rawRecord(page, score.id)).toEqual(original);
    await openMode(page, "내보내기");
    await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    expect(await rawRecord(page, score.id)).toEqual(original);
    expect(await page.evaluate(() => (window as Window & { scoreWriteCount?: number }).scoreWriteCount)).toBe(0);
    await page.getByRole("link", { name: score.title, exact: true }).click();
    await renameScore(page, "검증된 편집");
    await page.clock.runFor(500);
    await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
    expect(await storedScore(page, score.id)).toMatchObject({ id: score.id, title: "검증된 편집", schemaVersion: 2 });
    expect((await storedScore(page, score.id)).parts[0].ties).toEqual(score.parts[0].ties);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.clock.runFor(500);
    await expect.poll(async () => (await storedScore(page, score.id))?.title).toBe(score.title);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.clock.runFor(500);
    await expect.poll(async () => (await storedScore(page, score.id))?.title).toBe("검증된 편집");
    await page.reload();
    await expect(page.getByRole("heading", { name: "검증된 편집", exact: true })).toBeVisible();
  });
}

test("이전 정상 편집 세션이 남아 있어도 같은 ID의 실패 저장본을 다시 검증한다", async ({ page }) => {
  const score = tiedScore();
  await page.goto("/library");
  await rawRecord(page, score.id, { id: score.id, updatedAt: score.updatedAt, json: JSON.stringify(score) });
  await page.goto(`/editor/${score.id}`);
  await expect(page.getByRole("heading", { name: score.title, exact: true })).toBeVisible();
  await openMode(page, "내보내기");
  await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
  const open = page.getByRole("link", { name: score.title, exact: true });
  await expect(open).toBeVisible();
  const damaged = { id: score.id, updatedAt: "preserve", json: "{externally damaged", extra: "keep" };
  await rawRecord(page, score.id, damaged);
  await auditWrites(page);
  await page.clock.install();
  await open.click();
  await expect(page.getByTestId("score-open-error")).toBeVisible();
  await expect(page.getByTestId("score-open-error").locator('p[role="alert"]')).toContainText("INVALID_JSON");
  await page.clock.runFor(1000);
  expect(await rawRecord(page, score.id)).toEqual(damaged);
  expect(await page.evaluate(() => (window as Window & { scoreWriteCount?: number }).scoreWriteCount)).toBe(0);
});
