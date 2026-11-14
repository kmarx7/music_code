import { expect, test, type Page, type Locator } from "@playwright/test";
import { openMode } from "./editor-modes";
import { storedScore } from "./storage";

async function save(page: Page) {
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
}
async function ready(page: Page, id: string) {
  await page.goto(`/editor/${id}`); await expect(page.getByRole("button", { name: "저장", exact: true })).toBeVisible();
}
async function preview(page: Page, target = "major:2") {
  await openMode(page, "다듬기");
  await page.getByRole("button", { name: "조옮김", exact: true }).click();
  const panel = page.getByTestId("transpose-preview");
  await panel.getByLabel("조옮김 목표 조성", { exact: true }).selectOption(target);
  await expect(panel.getByRole("button", { name: "확정", exact: true })).toBeEnabled(); return panel;
}
// Read actual SVG geometry/glyphs, excluding generated IDs and unrelated layout offsets.
async function notation(staff: Locator) {
  await expect(staff.locator("svg")).toBeVisible();
  return staff.evaluate(async (root) => {
    await root.ownerDocument.fonts.ready;
    return ({
    heads: Array.from(root.querySelectorAll<SVGGraphicsElement>("[data-event-id] .vf-notehead")).map((head) => head.getBBox().y),
    signature: Array.from(root.querySelectorAll(".vf-keysignature text")).map((glyph) => glyph.textContent).join(""),
    ties: root.querySelectorAll(".vf-stavetie").length,
    });
  });
}
async function raw(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const request = db.transaction("scores", "readonly").objectStore("scores").get(id);
      return await new Promise<{ revision: number; json: string; deleted?: boolean }>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, id);
}

test("D/Db/C# 기보의 실제 SVG 위치·조표·타이가 Undo/Redo·저장·재열기 후 유지된다", async ({ page }) => {
  for (const [suffix, target, shift, pitches] of [
    ["d", "major:2", -5, [62, 64, 66, 69, 69]],
    ["db", "major:-5", -5, [61, 63, 65, 68, 68]],
    ["cs", "major:7", 0, [61, 63, 65, 68, 68]],
  ] as const) {
    const id = `e2e-transpose-svg-${suffix}`; await ready(page, id);
    for (const midi of [60, 62, 64]) await page.getByRole("button", { name: `MIDI ${midi}`, exact: true }).click();
    await openMode(page, "입력");
    await page.getByRole("button", { name: "2분음표", exact: true }).click();
    await page.getByRole("button", { name: "MIDI 67", exact: true }).click(); await save(page);
    const original = await storedScore(page, id); const staff = page.getByTestId("editor-content").getByTestId("staff");
    await expect(staff.locator("[data-event-id]")).toHaveCount(5); const before = await notation(staff);
    expect(before.heads).toHaveLength(5); expect(before.ties).toBe(1);
    const panel = await preview(page, target); const candidate = panel.getByTestId("staff");
    const expectedHeads = before.heads.map((y) => y + shift);
    await expect.poll(async () => (await notation(candidate)).heads).toEqual(expectedHeads);
    const candidateNotation = await notation(candidate); expect(candidateNotation.ties).toBe(1);
    expect(candidateNotation.signature.length).toBeGreaterThan(0); expect(await notation(staff)).toEqual(before);
    await openMode(page, "다듬기");
    await panel.getByRole("button", { name: "확정", exact: true }).click();
    await expect.poll(() => notation(staff)).toEqual(candidateNotation); await save(page);
    const changed = await storedScore(page, id);
    expect(changed.parts[0].measures.flatMap((m: { events: { pitch: { midi: number } }[] }) => m.events.map((e) => e.pitch.midi))).toEqual(pitches);
    expect(changed.parts[0].ties).toEqual(original.parts[0].ties);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => notation(staff)).toEqual(before); await expect.poll(() => storedScore(page, id)).toEqual(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => notation(staff)).toEqual(candidateNotation); await expect.poll(() => storedScore(page, id)).toEqual(changed);
    await page.reload(); await expect.poll(() => notation(staff)).toEqual(candidateNotation);
    await openMode(page, "연습");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("playback-position")).toContainText("재생 중");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await openMode(page, "내보내기");
    await page.getByRole("link", { name: "악보함 / JSON 가져오기", exact: true }).click();
    await page
      .getByRole("link", { name: "열기", exact: true })
      .and(page.locator(`a[href="/editor/${id}"]`))
      .click();
    await expect.poll(() => notation(staff)).toEqual(candidateNotation); expect(await storedScore(page, id)).toEqual(changed);
  }
});

test("미리보기 진입·취소 및 원본 재생 중 확정은 오디오 상태와 후보 하이라이트를 분리한다", async ({ page }) => {
  const id = "e2e-transpose-audio-state"; await ready(page, id);
  await openMode(page, "다듬기");
  await page.getByLabel("기본 템포 (BPM)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "템포 적용", exact: true }).click();
  await openMode(page, "입력");
  await page.getByRole("button", { name: "온음표", exact: true }).click();
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click(); await save(page);
  const original = await raw(page, id); const cursor = page.getByTestId("playback-position");
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute("data-tick"))).toBeGreaterThan(0);
  let panel = await preview(page); await expect(cursor).toContainText("정지");
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  expect(await raw(page, id)).toEqual(original); await expect(cursor).toHaveAttribute("data-tick", "0");
  panel = await preview(page);
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(page.getByTestId("editor-content").getByRole("button", { name: "C4", exact: true })).toHaveAttribute("data-playing", "true");
  await expect(panel.locator('[data-playing="true"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "확정", exact: true }).click();
  await expect(cursor).toContainText("정지"); await expect(cursor).toHaveAttribute("data-tick", "0");
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openMode(page, "다듬기");
  await expect(page.getByTestId("editor-content").getByRole("button", { name: "D4", exact: true })).toHaveAttribute("data-playing", "true");
  await openMode(page, "연습"); await page.getByRole("button", { name: "Stop", exact: true }).click(); await save(page);
  expect((await storedScore(page, id)).parts[0].measures[0].events[0].pitch.midi).toBe(62);
});

test("알림 없는 두 탭 동시 저장에서도 조옮김 결과와 패자의 편집 이력을 OCC가 보호한다", async ({ page, context }) => {
  await context.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true }); });
  const id = "e2e-transpose-occ"; await ready(page, id);
  await page.getByRole("button", { name: "MIDI 60", exact: true }).click(); await save(page);
  const other = await context.newPage(); await ready(other, id); const baseline = await raw(page, id);
  for (const tab of [page, other]) { await tab.clock.install(); await tab.clock.pauseAt(new Date(Date.now() + 1000)); }
  const panel = await preview(page); await panel.getByRole("button", { name: "확정", exact: true }).click();
  await openMode(other, "입력");
  await other.getByRole("button", { name: "MIDI 65", exact: true }).click();
  await Promise.all([page, other].map((tab) => tab.getByRole("button", { name: "저장", exact: true }).click()));
  await expect.poll(async () => (await raw(page, id)).revision).toBe(baseline.revision + 1);
  const committed = await raw(page, id); const transposed = JSON.parse(committed.json).parts[0].keySignature.fifths === 2;
  const loser = transposed ? other : page; const ownLabel = transposed ? "F4" : "D4";
  await expect(loser.getByTestId("storage-conflict")).toBeVisible();
  await openMode(loser, "다듬기");
  const chip = loser.getByTestId("editor-content").getByRole("button", { name: ownLabel, exact: true });
  await expect(chip).toBeVisible(); await loser.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(chip).toHaveCount(0); await loser.getByRole("button", { name: "Redo", exact: true }).click(); await expect(chip).toBeVisible();
  await loser.clock.runFor(1000); expect(await raw(page, id)).toEqual(committed);
  await expect(loser.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
});
