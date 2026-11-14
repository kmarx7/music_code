import { expect, test } from "@playwright/test";
import { openMode } from "./editor-modes";

test("보안 헤더(P6-07): CSP·권한 정책·nosniff·referrer·프레임 금지가 모든 화면 응답에 있다", async ({ request }) => {
  for (const path of ["/", "/new", "/record", "/library", "/licenses", "/editor/e2e-headers", "/print/e2e-headers", "/no-such-page"]) {
    const headers = (await request.get(path)).headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).not.toMatch(/https?:\/\//); // no third-party origin is allowed anywhere
    expect(csp, path).not.toContain("'unsafe-eval'"); // production build
    expect(headers["permissions-policy"], path).toContain("microphone=(self)");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"], path).toBe("DENY");
  }
});

test("CSP 위반 0건: 입력·재생·녹음(AudioWorklet)·악보 글꼴·인쇄·내보내기 전 과정", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const violations: string[] = [];
  const collect = async () => violations.push(...await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp));
  await page.goto("/");
  await collect();
  await page.goto("/new");
  await expect(page.getByRole("button", { name: "만들기", exact: true })).toBeVisible();
  await page.goto("/record");
  await expect(page.getByTestId("humming-flow")).toHaveAttribute("data-step", "setup");
  await collect();
  await page.goto("/editor/e2e-csp");
  for (const key of [60, 64, 67]) await page.getByRole("button", { name: `MIDI ${key}`, exact: true }).click();
  await page.getByLabel("악보 라벨", { exact: true }).selectOption("letter");
  await expect(page.getByTestId("editor-content").getByTestId("note-label")).toHaveCount(3);
  await openMode(page, "연습");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId("playback-position").getAttribute("data-tick"))).toBeGreaterThan(0);
  await openMode(page, "입력");
  const panel = page.getByTestId("recording-panel");
  await panel.getByLabel("마이크 사용과 기기 내 분석에 동의합니다").check();
  await panel.getByRole("button", { name: "녹음 시작", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "recording");
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await openMode(page, "내보내기");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "MusicXML", exact: true }).click();
  await download;
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장됨", { exact: true })).toBeVisible();
  await collect();
  await page.goto("/print/e2e-csp");
  await expect(page.getByTestId("print-view")).toHaveAttribute("data-state", "ready");
  await collect();
  expect(violations).toEqual([]);
});
