import { expect, test, type Download } from "@playwright/test";

async function json(download: Promise<Download>) {
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const noteMidis = (score: { parts: { measures: { events: { kind: string; pitch?: { midi: number } }[] }[] }[] }) =>
  score.parts[0].measures.flatMap((measure) => measure.events).filter((event) => event.kind === "note").map((event) => event.pitch?.midi);

test.describe("저장소를 쓸 수 없는 브라우저(P6-05)", () => {
  test.beforeEach(async ({ page }) => {
    // Private modes / blocked site data: IndexedDB is missing entirely.
    await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined }); });
  });

  test("홈은 안내와 '저장 없이 편집' 경로를 주고, 편집기는 메모리로 열려 저장됐다고 말하지 않으며 JSON 백업을 받을 수 있다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-recent")).toContainText("최근 악보를 불러오지 못했습니다");
    await page.getByRole("button", { name: "피아노로 시작", exact: true }).click();
    const alert = page.getByRole("alert").filter({ hasText: "이 브라우저에 악보를 저장할 수 없습니다" });
    await expect(alert).toBeVisible();
    await alert.getByRole("link", { name: "저장 없이 편집기 열기" }).click();
    await page.waitForURL(/\/editor\/[^/?]+\?start=piano$/);

    const banner = page.getByTestId("storage-unavailable");
    await expect(banner).toContainText("편집 내용이 저장되지 않습니다");
    for (const key of [60, 64]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
    await expect(page.getByRole("button", { name: "E4", exact: true })).toBeVisible();
    await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
    await expect(page.getByText("저장됨", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "PDF (인쇄)", exact: true })).toBeDisabled();

    const download = page.waitForEvent("download");
    await banner.getByRole("button", { name: "현재 내용 JSON 백업", exact: true }).click();
    expect(noteMidis(await json(download))).toEqual([60, 64]);
    // MIDI still works from memory.
    const midi = page.waitForEvent("download");
    await page.getByRole("button", { name: "MIDI", exact: true }).click();
    expect((await midi).suggestedFilename()).toBe("새 악보.mid");
  });
});

test("손상된 악보 기록 하나는 지금처럼 열지 않고 보호한다(메모리 모드로 덮어쓰지 않음)", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const tx = db.transaction("scores", "readwrite");
    tx.objectStore("scores").put({ id: "e2e-corrupt", revision: 1, updatedAt: "2026-11-14T00:00:00.000Z", json: "{not json" });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  });
  await page.goto("/editor/e2e-corrupt");
  await expect(page.getByTestId("score-open-error")).toBeVisible();
  await expect(page.getByTestId("storage-unavailable")).toHaveCount(0);
});

test("없는 주소는 안내 화면과 홈·악보함 링크를 보여 준다", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toContainText("페이지를 찾을 수 없습니다");
  await expect(page.getByTestId("not-found").getByRole("link", { name: "악보함" })).toBeVisible();
});

test("화면 오류가 나도 편집 중인 악보를 JSON으로 받을 수 있다", async ({ page }) => {
  await page.goto("/editor/e2e-render-crash");
  for (const key of [62, 65]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "F4", exact: true })).toBeVisible();
  // Simulate a rendering bug: the clipboard summary formats its length with toFixed during render.
  await page.evaluate(() => { Number.prototype.toFixed = () => { throw new Error("simulated render failure"); }; });
  await page.getByRole("button", { name: "구간 선택", exact: true }).click();
  await page.getByRole("button", { name: "구간 복사", exact: true }).click();
  const screen = page.getByTestId("error-screen");
  await expect(screen).toContainText("화면을 표시하는 중 문제가 생겼습니다");
  const download = page.waitForEvent("download");
  await screen.getByRole("button", { name: "현재 내용 JSON 백업", exact: true }).click();
  expect(noteMidis(await json(download))).toEqual([62, 65]);
  await expect(screen.getByRole("link", { name: "홈으로" })).toBeVisible();
});

test("악보함의 저장 공간 보호 요청은 누를 때만 묻고 결과를 알려 준다", async ({ page }) => {
  await page.goto("/library");
  const persistence = page.getByTestId("storage-persistence");
  await expect(persistence).not.toHaveAttribute("data-state", "unknown");
  const state = await persistence.getAttribute("data-state");
  if (state === "best-effort") {
    await persistence.getByRole("button", { name: "저장 공간 보호 요청", exact: true }).click();
    await expect(persistence).toHaveAttribute("data-state", /^(persisted|denied)$/);
  }
  await expect(persistence.getByTestId("storage-persistence-text")).not.toBeEmpty();
});
