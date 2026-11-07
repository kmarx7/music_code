import { expect, test } from "@playwright/test";
import { storedScore } from "./storage";

test("연속 편집·제목 Undo/Redo 직후 이동해도 최신 ID·제목·음표를 저장한다", async ({ page }) => {
  const id = "e2e-immediate-library";
  await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await page.getByRole("textbox", { name: "악보 제목", exact: true }).fill("이동 직전 연습곡");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  // 저장됨을 기다리지 않는다. 제품의 이동 전 flush를 검증한다.
  await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  const source = page.getByRole("link", { name: "이동 직전 연습곡", exact: true });
  await expect(source).toHaveAttribute("href", `/editor/${id}`);
  const saved = await storedScore(page, id);
  expect(saved).toMatchObject({ id, title: "이동 직전 연습곡", schemaVersion: 2 });
  expect(saved.parts[0].measures.flatMap((m: { events: { pitch: { midi: number } }[] }) => m.events)
    .map((event: { pitch: { midi: number } }) => event.pitch.midi)).toEqual([60, 62]);
  await page.reload();
  await source.click();
  await expect(page.getByRole("heading", { name: "이동 직전 연습곡", exact: true })).toBeVisible();
  await expect(page.getByText(/음표 2개/)).toBeVisible();
});

test("저장 트랜잭션 실패 시 이동을 막고 오류·JSON 백업·재시도를 제공한다", async ({ page }) => {
  const id = "e2e-navigation-save-error";
  await page.goto(`/editor/${id}`);
  await expect(page.getByText(/음표 0개/)).toBeVisible();
  await expect.poll(async () => (await storedScore(page, id))?.title).toBe("새 악보");
  await page.evaluate((scoreId) => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      const request = original.apply(this, args);
      if (this.name === "scores" && args[0]?.id === scoreId) {
        request.addEventListener("success", () => request.transaction!.abort());
      }
      return request;
    };
    (window as Window & { restoreScoreWrites?: () => void }).restoreScoreWrites = () => {
      IDBObjectStore.prototype.put = original;
    };
  }, id);
  await page.getByRole("textbox", { name: "악보 제목", exact: true }).fill("저장 실패해도 유지");
  await page.getByRole("button", { name: "제목 변경", exact: true }).click();
  await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("저장하지 못해 이동을 중단했습니다");
  await expect(page.getByText("저장 실패", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/editor/${id}$`));
  expect((await storedScore(page, id)).title).toBe("새 악보");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toMatchObject({ id, title: "저장 실패해도 유지" });
  await page.evaluate(() => (window as Window & { restoreScoreWrites?: () => void }).restoreScoreWrites?.());
  await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
  await expect(page.getByRole("link", { name: "저장 실패해도 유지", exact: true })).toHaveAttribute("href", `/editor/${id}`);
  expect(await storedScore(page, id)).toMatchObject({ id, title: "저장 실패해도 유지" });
});
