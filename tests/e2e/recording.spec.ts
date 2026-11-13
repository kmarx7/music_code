import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

async function fastScore(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  // 400 BPM keeps the 8-measure take short: count-in 0.6 s + 4.8 s.
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("400");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.tempoBpm).toBe(400);
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(1);
}

test("허밍 녹음: 동의 후 카운트인·녹음·레벨·8마디 자동 정지·분석, 악보와 편집 보존", async ({ page }) => {
  const id = "e2e-recording-flow";
  await fastScore(page, id);
  const before = await storedScore(page, id);
  const panel = page.getByTestId("recording-panel");
  await expect(panel).toContainText("400 BPM, 4/4박자");
  const start = panel.getByRole("button", { name: "녹음 시작", exact: true });
  await expect(start).toBeDisabled();
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await start.click();
  const progress = page.getByTestId("recording-progress");
  await expect(progress).toHaveAttribute("data-phase", "recording");
  await expect.poll(async () => Number(await page.getByTestId("recording-level").getAttribute("value")), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect(page.getByTestId("recording-time")).toContainText("/ 0:04");
  // No stop click: the take ends by itself at 8 measures, then the recording is analysed in the page.
  await expect(panel).toHaveAttribute("data-state", "result", { timeout: 20_000 });
  await expect(page.getByTestId("recording-result")).not.toBeEmpty();
  expect(await storedScore(page, id)).toEqual(before);
  await page.getByRole("button", { name: "MIDI 62", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(2);
});

test("허밍 녹음: 정지하면 분석하고, 취소하면 처음 상태로 돌아간다", async ({ page }) => {
  const id = "e2e-recording-stop";
  await fastScore(page, id);
  const panel = page.getByTestId("recording-panel");
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  await panel.getByRole("button", { name: "녹음 정지", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "result");
  await panel.getByRole("button", { name: "다시 녹음", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "idle");
  await expect(panel.getByRole("button", { name: "녹음 시작", exact: true })).toBeEnabled();
});

test("허밍 녹음: 마이크 권한이 거부되면 안내하고 편집은 계속된다", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  const id = "e2e-recording-denied";
  await page.goto(`/editor/${id}`);
  const panel = page.getByTestId("recording-panel");
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("마이크 사용이 허용되지 않았습니다");
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(1);
});
