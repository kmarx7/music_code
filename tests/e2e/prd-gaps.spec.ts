import { expect, test, type Page } from "@playwright/test";
import { openMode } from "./editor-modes";
import { storedScore } from "./storage";

interface StoredEvent { id: string; kind: string; startTick: number }
const ids = (score: { parts: { measures: { events: StoredEvent[] }[] }[] }) =>
  score.parts[0].measures.flatMap((measure) => measure.events.map((event) => event.id));

async function fourMeasures(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  for (const key of [60, 62, 64, 65]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.filter((m: { events: unknown[] }) => m.events.length).length).toBe(4);
}

test("커서부터 재생(MVP-012): 커서가 없으면 꺼져 있고, 커서 위치부터 재생하며 악보는 바뀌지 않는다", async ({ page }) => {
  const id = "e2e-play-from-cursor";
  await fourMeasures(page, id);
  const before = await storedScore(page, id);
  await openMode(page, "연습");
  const fromCursor = page.getByRole("button", { name: "커서부터 재생", exact: true });
  await expect(fromCursor).toBeDisabled();
  await openMode(page, "입력");
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  await page.getByLabel("커서 마디", { exact: true }).fill("3");
  await page.getByLabel("커서 박", { exact: true }).fill("1");
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
  await openMode(page, "연습");
  await expect(fromCursor).toBeEnabled();
  await fromCursor.click();
  const position = page.getByTestId("playback-position");
  await expect(position).toContainText("재생 중");
  await expect.poll(async () => Number(await position.getAttribute("data-tick"))).toBeGreaterThanOrEqual(2 * 3840);
  await expect(position).toContainText("3마디");
  await expect(fromCursor).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(await storedScore(page, id)).toEqual(before);

  // Past the last note there is nothing to hear: explain instead of a silent run.
  await openMode(page, "입력");
  await page.getByRole("button", { name: "마디 추가", exact: true }).click();
  await page.getByLabel("커서 마디", { exact: true }).fill("5");
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
  await openMode(page, "연습");
  await fromCursor.click();
  await expect(page.getByRole("alert").filter({ hasText: "커서 뒤에 재생할 음표가 없습니다" })).toBeVisible();
});

test("선택 구간 삭제(MVP-006): 한 번에 지우고 빈 자리를 남기며 클립보드는 그대로, Undo 1회로 복원", async ({ page }) => {
  const id = "e2e-delete-range";
  await fourMeasures(page, id);
  const before = await storedScore(page, id);
  // Fill the clipboard first so we can see delete leave it alone.
  await openMode(page, "다듬기");
  await page.getByLabel("구간 첫 마디", { exact: true }).fill("1");
  await page.getByLabel("구간 마지막 마디", { exact: true }).fill("1");
  await page.getByRole("button", { name: "구간 선택", exact: true }).click();
  await page.getByRole("button", { name: "구간 복사", exact: true }).click();
  const clip = page.getByTestId("clipboard-status");
  await expect(clip).toHaveAttribute("data-event-count", "1");

  await page.getByLabel("구간 첫 마디", { exact: true }).fill("2");
  await page.getByLabel("구간 마지막 마디", { exact: true }).fill("3");
  await page.getByRole("button", { name: "구간 선택", exact: true }).click();
  await page.getByRole("button", { name: "구간 삭제", exact: true }).click();
  await expect(page.getByTestId("clipboard-feedback")).toContainText("선택한 구간을 삭제했습니다");
  await expect.poll(async () => ids(await storedScore(page, id))).toEqual([ids(before)[0], ids(before)[3]]);
  const after = await storedScore(page, id);
  expect(after.parts[0].measures).toHaveLength(before.parts[0].measures.length);
  await expect(clip).toHaveAttribute("data-event-count", "1");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => storedScore(page, id)).toEqual(before);
});

test("녹음 중 추정 음높이(MVP-002): 들어오는 음을 실시간으로 보여 주고 후보·악보에는 영향이 없다", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 440;
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  const id = "e2e-live-pitch";
  await page.goto(`/editor/${id}`);
  await openMode(page, "다듬기");
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("400");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  const live = panel.getByTestId("recording-live-pitch");
  await expect(live).toHaveAttribute("data-midi", "69");
  await expect(live).toContainText("A4");
  const score = await storedScore(page, id);
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "idle");
  await expect(live).toHaveCount(0);
  expect(await storedScore(page, id)).toEqual(score);
});
