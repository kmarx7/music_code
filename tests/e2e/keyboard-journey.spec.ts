import { expect, test, type Locator, type Page } from "@playwright/test";
import { readSmf } from "../fixtures/smf-reader";
import { storedScore } from "./storage";

/** Moves focus with real Tab presses only (no script focus) until `target` has it; fails if Tab never reaches it. */
async function tabTo(page: Page, target: Locator, limit = 400) {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${target}`);
}
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
/** Phase 7 work modes by keyboard: Tab to the mode bar (only the chosen tab is in the Tab order), then arrow keys. */
async function modeByKeys(page: Page, name: string) {
  const bar = page.getByRole("tablist", { name: "작업 모드" });
  const target = bar.getByRole("tab", { name, exact: true });
  await tabTo(page, bar.getByRole("tab", { selected: true }));
  for (let step = 0; step < 4 && await target.getAttribute("aria-selected") !== "true"; step += 1) await page.keyboard.press("ArrowRight");
  await expect(target).toHaveAttribute("aria-selected", "true");
  await expect(target).toBeFocused();
}
const midis = async (page: Page, id: string) => ((await storedScore(page, id))?.parts[0].measures ?? [])
  .flatMap((measure: { events: { kind: string; pitch?: { midi: number } }[] }) => measure.events)
  .filter((event: { kind: string }) => event.kind === "note").map((event: { pitch?: { midi: number } }) => event.pitch?.midi);

test("키보드만으로 PRD §11 흐름: 시작(/new)→입력→편집→Undo/Redo→재생·연습 속도·A–B→복사·붙여넣기→저장→MIDI 출력", async ({ page }) => {
  await page.goto("/");
  await tabTo(page, page.getByRole("link", { name: "피아노로 시작", exact: true }));
  // A visible focus indicator on the focused control (WCAG 2.4.7).
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/new$/);
  await tabTo(page, button(page, "만들기"));
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/editor\/([^/?]+)\?start=piano$/);
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
  await expect(button(page, "MIDI 60")).toBeVisible();

  // Input with the computer-keyboard piano (A S D G = C4 D4 E4 G4), focus on the page.
  await page.locator("body").press("Escape");
  for (const key of ["a", "s", "d", "g"]) await page.keyboard.press(key);
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 64, 67]);

  // Edit (다듬기): pick E4 in the note list, raise it a semitone.
  await modeByKeys(page, "다듬기");
  await tabTo(page, button(page, "E4"));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "반음 올리기" }));
  await page.keyboard.press("Enter");
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 65, 67]);

  // Undo / Redo.
  await tabTo(page, button(page, "Undo"));
  await page.keyboard.press("Enter");
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 64, 67]);
  await tabTo(page, button(page, "Redo"));
  await page.keyboard.press("Enter");
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 65, 67]);

  // Practice (연습): rate slider with arrow keys, A–B loop with Space, Play / Stop with Enter.
  await modeByKeys(page, "연습");
  const slider = page.getByLabel("연습 속도", { exact: true });
  await tabTo(page, slider);
  for (let step = 0; step < 10; step += 1) await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("practice-rate")).toHaveAttribute("data-rate", "50");
  await tabTo(page, page.getByLabel("A–B 반복", { exact: true }));
  await page.keyboard.press("Space");
  await expect(page.getByTestId("practice-loop")).toHaveAttribute("data-loop", "on");
  await tabTo(page, button(page, "Play"));
  await page.keyboard.press("Enter");
  await expect.poll(async () => Number(await page.getByTestId("playback-position").getAttribute("data-tick"))).toBeGreaterThan(0);
  await expect(button(page, "Stop")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("playback-position")).toHaveAttribute("data-tick", "0");

  // Copy measure 1 and paste it at measure 2 through the edit cursor (입력), typing into the number fields (다듬기).
  await modeByKeys(page, "입력");
  const inputMode = page.getByLabel("입력 위치", { exact: true });
  await tabTo(page, inputMode);
  // Headless macOS Chromium does not forward keys to a native <select> popup, so only the value change is scripted
  // here; Tab reachability is real. Keyboard choice inside the native list is a manual UAT item (UAT-K).
  await inputMode.selectOption("cursor");
  await expect(inputMode).toBeFocused();
  await tabTo(page, page.getByLabel("커서 마디", { exact: true }));
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("2");
  await tabTo(page, button(page, "커서 이동"));
  await page.keyboard.press("Enter");
  await modeByKeys(page, "다듬기");
  await tabTo(page, button(page, "구간 선택"));
  await page.keyboard.press("Enter");
  await tabTo(page, button(page, "구간 복사"));
  await page.keyboard.press("Enter");
  await tabTo(page, button(page, "커서에 붙여넣기"));
  await page.keyboard.press("Enter");
  await expect.poll(() => midis(page, id)).toEqual([60, 62, 65, 67, 60, 62, 65, 67]);

  // Save, then export MIDI.
  await tabTo(page, button(page, "저장"));
  await page.keyboard.press("Enter");
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await modeByKeys(page, "내보내기");
  await tabTo(page, button(page, "MIDI"));
  await page.keyboard.press("Enter");
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  expect(readSmf(new Uint8Array(Buffer.concat(chunks))).notes.map((note) => note.midi)).toEqual([60, 62, 65, 67, 60, 62, 65, 67]);
});
