import { expect, test, type Page } from "@playwright/test";
import { openHummingAdd, openMode } from "./editor-modes";
import { storedScore } from "./storage";

async function fastScore(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  // 400 BPM keeps the 8-measure take short: count-in 0.6 s + 4.8 s.
  await openMode(page, "다듬기");
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("400");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await openMode(page, "입력");
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.tempoBpm).toBe(400);
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(1);
}

test("허밍 녹음: 동의 후 카운트인·녹음·레벨·8마디 자동 정지·분석, 악보와 편집 보존", async ({ page }) => {
  const id = "e2e-recording-flow";
  await fastScore(page, id);
  const before = await storedScore(page, id);
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await expect(panel).toContainText("400 BPM, 4/4박자");
  await openHummingAdd(page);
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

test("허밍 녹음: 정지하면 분석하고, 취소하면 마이크 단계로, 닫으면 처음 상태로 돌아간다", async ({ page }) => {
  const id = "e2e-recording-stop";
  await fastScore(page, id);
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await openHummingAdd(page);
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  await panel.getByRole("button", { name: "녹음 정지", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "result");
  await panel.getByRole("button", { name: "다시 녹음", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  // Cancelling is the user's own choice: back to ② 마이크 with consent kept, ready to record again, no message.
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "mic");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "녹음 시작", exact: true })).toBeEnabled();
  // "닫기" folds the steps back to the single "허밍 추가" button.
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "idle");
  await expect(panel.getByRole("button", { name: "허밍 추가", exact: true })).toBeVisible();
});

test("허밍 녹음: 마이크 권한이 거부되면 안내하고 편집은 계속된다", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  const id = "e2e-recording-denied";
  await page.goto(`/editor/${id}`);
  const panel = page.getByTestId("recording-panel");
  await openHummingAdd(page);
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("마이크 사용이 허용되지 않았습니다");
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.flatMap((m: { events: unknown[] }) => m.events).length).toBe(1);
});

test("허밍 녹음 확정: 후보 미리보기 후 악보 끝에 Command 한 번으로 넣고 Undo 한 번에 되돌린다", async ({ page }) => {
  // A steady A4 as the microphone, so the take has a known result (the default fake device only beeps).
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
  const id = "e2e-recording-commit";
  await fastScore(page, id);
  const before = await storedScore(page, id);
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await openHummingAdd(page);
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-result")).toHaveAttribute("data-ok", "true", { timeout: 20_000 });
  const chips = panel.getByRole("list", { name: "채보 후보 음표" }).getByRole("listitem");
  await expect(chips.first()).toHaveText("A4");
  await expect(panel.locator('[data-low-confidence="true"]')).toHaveCount(0);
  await expect(panel).toContainText("2마디부터 넣으면");
  await expect(page.getByTestId("recording-candidate").locator("[data-event-id]").first()).toBeVisible();
  expect(await storedScore(page, id)).toEqual(before);

  await panel.getByLabel("커서가 있는 마디부터").check();
  await expect(panel.getByRole("alert")).toContainText("커서를 먼저 놓아 주세요");
  await expect(panel.getByRole("button", { name: "악보에 넣기", exact: true })).toBeDisabled();
  await panel.getByLabel("악보 끝에 이어쓰기").check();
  await panel.getByRole("button", { name: "악보에 넣기", exact: true }).click();
  await expect(page.getByTestId("recording-notice")).toContainText("2마디부터 음표");
  await expect(panel).toHaveAttribute("data-state", "idle");

  // The take needed more measures than the score had; they were added by the same command.
  await expect.poll(async () => (await storedScore(page, id))?.parts[0].measures.length ?? 0)
    .toBeGreaterThan(before.parts[0].measures.length);
  const stored = await storedScore(page, id);
  const transcribed = stored.parts[0].measures.flatMap((measure: { events: { kind: string; pitch?: { midi: number };
    provenance?: { source: string } }[] }) => measure.events).filter((event: { provenance?: { source: string } }) => event.provenance?.source === "transcription");
  expect(transcribed.length).toBeGreaterThan(0);
  expect(transcribed.every((event: { kind: string; pitch?: { midi: number } }) => event.kind === "note" && event.pitch?.midi === 69)).toBe(true);
  expect(stored.parts[0].measures[1].events[0].startTick).toBe(3840);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => storedScore(page, id)).toEqual(before);
});

test("허밍 추가(A-5): 입력 모드의 단계 흐름은 ① 설정을 악보 값으로 고정하고 ②부터 시작하며, 열고 닫아도 악보는 그대로다", async ({ page }) => {
  const id = "e2e-humming-add-steps";
  await fastScore(page, id);
  const before = await storedScore(page, id);
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await expect(panel).toHaveAttribute("data-state", "idle");
  await expect(panel.getByRole("button", { name: "녹음 시작", exact: true })).toHaveCount(0);
  await openHummingAdd(page);
  const steps = panel.getByRole("list", { name: "진행 단계" }).getByRole("listitem");
  await expect(steps).toHaveText(["1 설정 ✓", "2 마이크", "3 녹음", "4 확인"]);
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(panel.getByRole("heading", { name: "마이크 준비" })).toBeFocused();
  // Step ① is the score itself: its tempo and meter, not editable here.
  await expect(panel).toContainText("400 BPM · 4/4박자");
  await expect(panel.getByLabel("기본 템포 (BPM)")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "녹음 시작", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "idle");
  expect(await storedScore(page, id)).toEqual(before);
});
