import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { makeZip } from "../fixtures/zip";
import { storedScore } from "./storage";

const FIXTURES = join(__dirname, "../fixtures/musicxml-import");
const fixture = (name: string) => join(FIXTURES, name);

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
const flow = (page: Page) => page.getByTestId("import-flow");
const step = (page: Page, name: string) => expect(flow(page)).toHaveAttribute("data-step", name);
async function createdId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/editor\//);
  return decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
}

test("홈의 세 가지 시작: 허밍·피아노·악보 올리기", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "허밍으로 시작", exact: true })).toHaveAttribute("href", "/record");
  await expect(page.getByRole("link", { name: "피아노로 시작", exact: true })).toHaveAttribute("href", "/new");
  await expect(page.getByRole("link", { name: "악보 올리기", exact: true })).toHaveAttribute("href", "/import");
  await page.getByRole("link", { name: "악보 올리기", exact: true }).click();
  await expect(page).toHaveTitle(/악보 올리기/);
  await step(page, "file");
  await expect(flow(page)).toContainText("PDF·사진 인식은 준비 중입니다.");
});

test("피아노 악보 → 12현 산조가야금, 음역에 맞는 조로 악보 하나 (두 번 눌러도 하나)", async ({ page }) => {
  await page.goto("/");
  const before = await scoreIds(page);
  await page.goto("/import");
  await page.getByLabel("악보 파일").setInputFiles(fixture("piano-two-staves.musicxml"));
  await step(page, "review");
  await expect(page.getByTestId("import-notices")).toContainText("아래 단(왼손)");
  await expect(page.getByTestId("import-summary")).toContainText("피아노 연습");
  await expect(page.getByTestId("import-preview").locator("svg")).toHaveCount(1);
  await page.getByRole("button", { name: "다음" }).click();
  await step(page, "convert");
  await page.getByLabel("목표 악기").selectOption("gayageum-12-sanjo");
  await page.getByRole("button", { name: /^1순위 .*반음 후보 적용$/ }).click();
  await expect(page.getByTestId("import-instrument-fit")).toContainText("모든 음이 음역 안");
  await page.getByRole("button", { name: "악보 만들기" }).dblclick();
  const id = await createdId(page);
  expect((await scoreIds(page)).length).toBe(before.length + 1);
  const saved = await storedScore(page, id);
  expect(saved.parts[0].instrument).toBe("gayageum-12-sanjo");
  expect(saved.title).toBe("피아노 연습");
});

test("단선율을 피아노 B♭장조로", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("악보 파일").setInputFiles(fixture("simple-melody.musicxml"));
  await step(page, "review");
  await expect(page.getByTestId("import-notices")).toContainText("원본 선율을 그대로 가져왔습니다.");
  await expect(page.getByTestId("import-summary")).toContainText("100");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByLabel("목표 조").selectOption("major:-2");
  await expect(page.getByLabel("목표 조").locator("option:checked")).toHaveText("Bb 장조");
  await expect(page.getByTestId("import-result").locator("svg")).toHaveCount(1);
  await page.getByRole("button", { name: "악보 만들기" }).click();
  const saved = await storedScore(page, await createdId(page));
  expect(saved.parts[0].keySignature.fifths).toBe(-2);
  expect(saved.parts[0].instrument).toBe("piano");
});

test(".mxl도 읽고, 깨진 파일은 이유를 알려 준다", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("악보 파일").setInputFiles({ name: "broken.musicxml", mimeType: "application/xml", buffer: Buffer.from("<score-partwise><part") });
  await expect(flow(page).getByRole("alert")).toHaveText("MusicXML 파일로 읽을 수 없습니다.");
  await step(page, "file");
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>';
  const zip = makeZip([
    { name: "META-INF/container.xml", data: container, method: 8 },
    { name: "score.musicxml", data: new Uint8Array(readFileSync(fixture("simple-melody.musicxml"))), method: 8 },
  ]);
  await page.getByLabel("악보 파일").setInputFiles({ name: "song.mxl", mimeType: "application/vnd.recordare.musicxml", buffer: Buffer.from(zip) });
  await step(page, "review");
  await expect(page.getByTestId("import-summary")).toContainText("아리랑 연습");
});

test("중간에 나가면 아무것도 저장하지 않는다", async ({ page }) => {
  await page.goto("/");
  const before = await scoreIds(page);
  await page.goto("/import");
  await page.getByLabel("악보 파일").setInputFiles(fixture("pickup-and-changes.musicxml"));
  await step(page, "review");
  await page.getByRole("button", { name: "다음" }).click();
  await step(page, "convert");
  await page.getByRole("link", { name: "← 그만두기" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await scoreIds(page)).toEqual(before);
});

test("고를 수 없는 파트를 골라도 파트 선택은 남아 다시 바꿀 수 있다", async ({ page }) => {
  const part = (id: string, key: number) => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${key}</fifths></key>`
    + `<time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice></note></measure></part>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list>`
    + `<score-part id="P1"><part-name>Flute</part-name></score-part><score-part id="P2"><part-name>Odd</part-name></score-part>`
    + `<score-part id="P3"><part-name>Drums</part-name></score-part></part-list>${part("P1", 0)}${part("P2", 9)}`
    + `<part id="P3"><measure number="1"><attributes><divisions>1</divisions></attributes><note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration><voice>1</voice></note></measure></part></score-partwise>`;
  await page.goto("/import");
  await page.getByLabel("악보 파일").setInputFiles({ name: "parts.musicxml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await step(page, "review");
  const picker = page.getByLabel("가져올 파트");
  await expect(picker.locator("option", { hasText: "Drums" })).toBeDisabled();
  await picker.selectOption({ label: "Odd · 음 1개" });
  await expect(flow(page).getByRole("alert")).toContainText("조표");
  await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
  await picker.selectOption({ label: "Flute · 음 1개" });
  await expect(page.getByRole("button", { name: "다음" })).toBeEnabled();
});
