import { expect, test, type Page } from "@playwright/test";
import { storedScore } from "./storage";

/** A steady A4 instead of the fake device's beeps, so the take has notes to transcribe (same as prd-gaps). */
async function a440(page: Page) {
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
}
async function scoreIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      if (!db.objectStoreNames.contains("scores")) return [];
      const request = db.transaction("scores", "readonly").objectStore("scores").getAll();
      const rows = await new Promise<{ id: string; deleted?: boolean; tombstone?: boolean }[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return rows.filter((row) => !row.deleted && !row.tombstone).map((row) => row.id);
    } finally { db.close(); }
  });
}
const flow = (page: Page) => page.getByTestId("humming-flow");
const step = (page: Page, name: string) => expect(flow(page)).toHaveAttribute("data-step", name);

test("허밍 시작(/record): 설정→마이크→녹음→확인→악보 만들기 한 번에 악보 하나, 설정과 채보 음이 들어가고 녹음은 저장하지 않는다", async ({ page }) => {
  await a440(page);
  await page.goto("/");
  const before = await scoreIds(page);
  await page.getByRole("link", { name: "허밍으로 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/record$/);
  await expect(page).toHaveTitle("허밍으로 시작 · 허밍버드");

  // ① 설정: defaults 4/4 · 90; the key is not asked (C major).
  await step(page, "setup");
  await expect(page.getByRole("list", { name: "진행 단계" }).getByRole("listitem").first()).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("템포 (BPM)")).toHaveValue("90");
  await expect(page.getByLabel("조성")).toHaveCount(0);
  await page.getByLabel("제목").fill("콧노래");
  await page.getByLabel("템포 (BPM)").fill("400"); // short take: 1 count-in measure + 8 × 0.6 s
  await page.getByRole("button", { name: "다음", exact: true }).click();

  // ② 마이크: consent gates the start; back keeps the settings.
  await step(page, "mic");
  await expect(page.getByRole("heading", { name: "마이크 준비" })).toBeFocused();
  await expect(page.getByText("400 BPM · 4/4박자")).toBeVisible();
  await expect(page.getByText("이어폰을 권장")).toBeVisible();
  const start = page.getByRole("button", { name: "녹음 시작", exact: true });
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("제목")).toHaveValue("콧노래");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await start.click();

  // ③ 녹음: progress, live pitch, level; it stops by itself after 8 measures.
  await expect(page.getByTestId("recording-progress")).toHaveAttribute("data-phase", "recording");
  await expect(page.getByTestId("recording-live-pitch")).toHaveAttribute("data-midi", "69");
  expect(await scoreIds(page)).toEqual(before);

  // ④ 확인: candidate staff and playback; nothing is stored until "악보 만들기".
  await step(page, "review");
  await expect(page.getByTestId("recording-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("recording-candidate").locator("svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await scoreIds(page)).toEqual(before);
  await page.getByRole("button", { name: "악보 만들기", exact: true }).dblclick();
  await page.waitForURL(/\/editor\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "콧노래", exact: true })).toBeVisible();

  const after = await scoreIds(page);
  expect(after).toHaveLength(before.length + 1);
  const id = after.find((candidate) => !before.includes(candidate))!;
  const stored = await storedScore(page, id);
  expect(stored).toMatchObject({ title: "콧노래", tempoBpm: 400 });
  expect(stored.parts[0].timeSignature).toEqual({ numerator: 4, denominator: 4 });
  const notes = stored.parts[0].measures.flatMap((measure: { events: { kind: string; pitch?: { midi: number } }[] }) => measure.events)
    .filter((event: { kind: string }) => event.kind === "note");
  expect(notes.length).toBeGreaterThan(0);
  expect(notes.every((note: { pitch?: { midi: number } }) => note.pitch?.midi === 69)).toBe(true);
  // No audio anywhere in the stored record.
  expect(JSON.stringify(stored)).not.toMatch(/samples|pcm|audio/i);
});

test("허밍 시작(/record): 기본값으로 시작, 녹음 취소·다시 녹음, 어느 단계에서 나가도 악보를 만들지 않는다", async ({ page }) => {
  await a440(page);
  await page.goto("/record");
  const before = await scoreIds(page);
  await page.getByRole("button", { name: /기본값으로 시작/ }).click();
  await step(page, "mic");
  await expect(page.getByText("90 BPM · 4/4박자")).toBeVisible();
  await page.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  // Cancel goes back to the microphone step without a message.
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await step(page, "mic");
  await expect(flow(page).getByRole("alert")).toHaveCount(0);
  // Stop early → review; "다시 녹음" records again right away.
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toHaveAttribute("data-phase", "recording");
  await page.getByRole("button", { name: "녹음 정지", exact: true }).click();
  await step(page, "review");
  await page.getByRole("button", { name: "다시 녹음", exact: true }).click();
  await expect(page.getByTestId("recording-progress")).toBeVisible();
  // Leaving mid-take: the microphone is released and nothing is created.
  await page.getByRole("link", { name: "← 그만두기" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await scoreIds(page)).toEqual(before);
});

test("허밍 시작(/record): 마이크 권한을 거부하면 마이크 단계에 원인과 다시 시도 경로를 보이고 아무것도 저장하지 않는다", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); };
  });
  await page.goto("/record");
  const before = await scoreIds(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await page.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await step(page, "mic");
  await expect(flow(page).getByRole("alert")).toContainText("마이크");
  await expect(page.getByRole("button", { name: "녹음 시작", exact: true })).toBeEnabled();
  expect(await scoreIds(page)).toEqual(before);
});
