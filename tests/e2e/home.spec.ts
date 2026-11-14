import { expect, test, type Page } from "@playwright/test";
import { renameScore } from "./editor-modes";
import { storedScore } from "./storage";

async function scoreCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const open = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try {
      if (!db.objectStoreNames.contains("scores")) return 0;
      const request = db.transaction("scores", "readonly").objectStore("scores").getAll();
      const rows = await new Promise<{ deleted?: boolean; tombstone?: boolean }[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return rows.filter((row) => !row.deleted && !row.tombstone).length;
    } finally { db.close(); }
  });
}

test("홈 첫 방문: 소개·시작 버튼·로컬 저장 안내, 최근 악보는 비어 있고 고정 데모 링크는 없다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("허밍버드 — 흥얼거린 멜로디를 악보로");
  await expect(page.getByTestId("brand")).toHaveText("허밍버드");
  const icon = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect((await page.request.get(icon!)).headers()["content-type"]).toContain("image/svg+xml");
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await page.request.get(apple!)).headers()["content-type"]).toContain("image/png");
  expect(await page.locator('meta[property="og:site_name"]').getAttribute("content")).toBe("허밍버드");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "허밍으로 시작", exact: true })).toHaveAttribute("href", "/record");
  await expect(page.getByRole("link", { name: "피아노로 시작", exact: true })).toHaveAttribute("href", "/new");
  await expect(page.getByTestId("home-recent")).toContainText("아직 만든 악보가 없습니다");
  await expect(page.getByText("이 브라우저에만 저장")).toBeVisible();
  await expect(page.locator('a[href="/editor/demo-score"]')).toHaveCount(0);
  await expect(page.getByText("Phase 1")).toHaveCount(0);
  await page.getByRole("link", { name: "오픈소스 라이선스" }).click();
  await expect(page.getByRole("heading", { name: "오픈소스 라이선스", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("오픈소스 라이선스 · 허밍버드");
  await expect(page.locator("#ofl")).toContainText("SIL OPEN FONT LICENSE Version 1.1");
  await expect(page.getByRole("row")).toHaveCount(15); // header + 14 components
});

test("피아노로 시작(/new): 설정을 고르고 만들기 한 번에 악보 하나, 설정이 악보에 들어가고 편집기 입력 모드의 건반으로 간다", async ({ page }) => {
  await page.goto("/");
  const before = await scoreCount(page);
  await page.getByRole("link", { name: "피아노로 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page).toHaveTitle("새 악보 · 허밍버드");
  // Defaults (decision 2/3): 4/4 · 90 BPM · C major · piano; Korean instruments are shown but not selectable yet.
  await expect(page.getByLabel("제목")).toHaveValue("새 악보");
  await expect(page.getByLabel("박자")).toHaveValue("4/4");
  await expect(page.getByLabel("템포 (BPM)")).toHaveValue("90");
  await expect(page.getByLabel("조성")).toHaveValue("major:0");
  await expect(page.getByLabel("목표 악기")).toHaveValue("piano");
  await expect(page.getByRole("option", { name: "향피리 (준비 중)" })).toBeDisabled();
  expect(await scoreCount(page)).toBe(before);

  // Invalid input is refused on the page, nothing is saved.
  await page.getByLabel("템포 (BPM)").fill("500");
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "템포는 20–400 사이의 정수" })).toBeVisible();
  expect(await scoreCount(page)).toBe(before);

  await page.getByLabel("제목").fill("봄 노래");
  await page.getByLabel("박자").selectOption("3/4");
  await page.getByLabel("템포 (BPM)").fill("72");
  await page.getByLabel("조성").selectOption("major:1");
  await page.getByRole("button", { name: "만들기", exact: true }).dblclick();
  await page.waitForURL(/\/editor\/[^/?]+\?start=piano$/);
  await expect(page.getByRole("heading", { name: "봄 노래", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "입력", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "MIDI 60", exact: true })).toBeInViewport();
  expect(await scoreCount(page)).toBe(before + 1);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const stored = await storedScore(page, id);
  expect(stored).toMatchObject({ title: "봄 노래", tempoBpm: 72 });
  expect(stored.parts[0].timeSignature).toEqual({ numerator: 3, denominator: 4 });
  expect(stored.parts[0].keySignature).toMatchObject({ tonic: "G", fifths: 1, mode: "major" });
});

test("피아노로 시작(/new): 만들기 전에 나가면 악보를 만들지 않는다", async ({ page }) => {
  await page.goto("/");
  const before = await scoreCount(page);
  await page.getByRole("link", { name: "피아노로 시작", exact: true }).click();
  await page.getByLabel("제목").fill("만들지 않을 악보");
  await page.getByRole("link", { name: "← 홈" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await scoreCount(page)).toBe(before);
});

test("옛 주소 ?start=hum은 편집기 입력 모드의 녹음 패널을 열고 동의 체크에 포커스, 녹음은 시작하지 않는다", async ({ page }) => {
  await page.goto("/editor/e2e-old-start-hum?start=hum");
  const panel = page.getByTestId("recording-panel");
  await expect(page.getByRole("tab", { name: "입력", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel).toBeInViewport();
  await expect(panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다")).toBeFocused();
  await expect(panel).toHaveAttribute("data-state", "idle");
});

test("홈 최근 악보: 최근 수정한 3개를 보여 주고 열 수 있으며 전체 목록 링크가 있다", async ({ page }) => {
  for (const title of ["첫째", "둘째", "셋째", "넷째"]) {
    await page.goto("/new");
    await page.getByRole("button", { name: "만들기", exact: true }).click();
    await page.waitForURL(/\/editor\//);
    await renameScore(page, title);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  }
  await page.goto("/");
  const recent = page.getByTestId("home-recent").getByRole("listitem");
  await expect(recent).toHaveCount(3);
  await expect(recent.first()).toContainText("넷째");
  await expect(page.getByTestId("home-recent")).not.toContainText("첫째");
  await recent.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "넷째", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "모든 악보 보기", exact: false }).click();
  await expect(page.getByRole("heading", { name: "악보함", exact: true })).toBeVisible();
});
