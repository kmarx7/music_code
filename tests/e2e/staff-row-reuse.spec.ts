import { expect, test, type Page } from "@playwright/test";
import { scoreNoteCount } from "./score-summary";
import { storedScore } from "./storage";

const staff = (page: Page) => page.getByTestId("editor-content").getByTestId("staff");
/** Marks every current row group; a redrawn row is a new node and loses its mark. */
async function mark(page: Page) {
  await staff(page).evaluate((root) => root.querySelectorAll("[data-staff-row]")
    .forEach((row) => { (row as Element & { kept?: boolean }).kept = true; }));
}
async function kept(page: Page) {
  return staff(page).evaluate((root) => Array.from(root.querySelectorAll("[data-staff-row]"))
    .map((row) => `${row.getAttribute("data-staff-row")}:${(row as Element & { kept?: boolean }).kept ? "kept" : "new"}`));
}
async function move(page: Page, measure: number) {
  await page.getByLabel("커서 마디", { exact: true }).fill(String(measure));
  await page.getByLabel("커서 박", { exact: true }).fill("1");
  await page.getByRole("button", { name: "커서 이동", exact: true }).click();
}

test("편집·Undo·커서 이동은 바뀐 줄만 다시 그리고 표시 방식 변경은 전체를 다시 그린다 (H-03)", async ({ page }) => {
  const id = "e2e-staff-row-reuse"; await page.goto(`/editor/${id}`);
  await page.getByLabel("입력 위치", { exact: true }).selectOption("cursor");
  const add = page.getByRole("button", { name: "마디 추가", exact: true });
  const staves = staff(page).locator(".vf-stave");
  await expect(staves).not.toHaveCount(0);
  for (let count = await staves.count(); count < 9; count += 1) { await add.click(); await expect(staves).toHaveCount(count + 1); }
  await expect(staff(page).locator("[data-staff-row]")).toHaveCount(3);
  const last = 9;

  // A note in the first row and one in the last row.
  await move(page, 1); await page.getByRole("button", { name: "MIDI 60", exact: true }).click();
  await expect(scoreNoteCount(page, 1)).toBeVisible();
  await mark(page);
  await move(page, last);
  await expect(page.getByTestId("staff-edit-cursor")).toHaveAttribute("data-tick", String((last - 1) * 3840));
  expect(await kept(page)).toEqual(["0:kept", "1:kept", "2:kept"]); // a cursor move redraws no row

  await page.getByRole("button", { name: "MIDI 64", exact: true }).click();
  await expect(scoreNoteCount(page, 2)).toBeVisible();
  expect(await kept(page)).toEqual(["0:kept", "1:kept", "2:new"]);
  await expect(staff(page).locator("[data-event-id]")).toHaveCount(2);
  await expect(staff(page).locator('[data-staff-row="0"] [data-event-id]')).toHaveCount(1);
  await expect(staff(page).locator('[data-staff-row="2"] [data-event-id]')).toHaveCount(1);

  await mark(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(scoreNoteCount(page, 1)).toBeVisible();
  expect(await kept(page)).toEqual(["0:kept", "1:kept", "2:new"]);
  await expect(staff(page).locator("[data-event-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(scoreNoteCount(page, 2)).toBeVisible();

  // A kept row still answers clicks on its original event.
  const firstId = async () => (await storedScore(page, id))?.parts[0].measures[0].events[0]?.id as string | undefined;
  await expect.poll(firstId).toBeTruthy(); // autosave is debounced
  const first = (await firstId())!;
  await expect(staff(page).locator('[data-staff-row="0"] [data-event-id]')).toHaveAttribute("data-event-id", first);

  await mark(page);
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(staff(page).getByTestId("note-label")).toHaveCount(2);
  expect(await kept(page)).toEqual(["0:new", "1:new", "2:new"]);
});
