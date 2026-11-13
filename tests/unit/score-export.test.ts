import { describe, expect, it } from "vitest";
import { exportFileName, exportScore, exportScoreBackup, type ExportPort } from "@/application";
import { serializeScore } from "@/domain/score";
import type { Score } from "@/domain/score";
import { tiedScore } from "../fixtures/scores";

const port = (write: ExportPort["write"]): ExportPort => ({ format: "midi", mimeType: "audio/midi", write });

describe("exportFileName", () => {
  it("shares the JSON backup rule across every format", () => {
    const score = { ...tiedScore(), title: 'a/b:c*?"<>|d' };
    const stem = exportScoreBackup(score).filename.replace(/\.json$/, "");
    expect(exportFileName(score.title, "json")).toBe(`${stem}.json`);
    expect(exportFileName(score.title, "midi")).toBe(`${stem}.mid`);
    expect(exportFileName(score.title, "musicxml")).toBe(`${stem}.musicxml`);
    expect(exportFileName(score.title, "pdf")).toBe(`${stem}.pdf`);
  });

  it("composes NFD Hangul before the 80-character limit and falls back to score", () => {
    expect(exportFileName("연습곡".normalize("NFD"), "midi")).toBe("연습곡.mid");
    expect(exportFileName("가".repeat(90).normalize("NFD"), "musicxml")).toBe(`${"가".repeat(80)}.musicxml`);
    expect(exportFileName("  \u0001 ", "pdf")).toBe("_.pdf");
    expect(exportFileName("   ", "pdf")).toBe("score.pdf");
  });
});

describe("exportScore", () => {
  it("names the file from the title and returns the writer's data with its media type", () => {
    const score = { ...tiedScore(), title: "붙임줄 연습" };
    const result = exportScore(score, port(() => ({ ok: true, data: new Uint8Array([1, 2]) })));
    expect(result).toEqual({ ok: true, file: { data: new Uint8Array([1, 2]), filename: "붙임줄 연습.mid", mimeType: "audio/midi" } });
  });

  it("hands the writer a validated copy, so a writer cannot change the score", () => {
    const score = tiedScore();
    const before = serializeScore(score);
    let seen: Readonly<Score> | undefined;
    exportScore(score, port((input) => {
      seen = input;
      (input as Score).title = "changed";
      (input.parts[0].measures as unknown[]).length = 0;
      return { ok: true, data: "x" };
    }));
    expect(seen).not.toBe(score);
    expect(serializeScore(score)).toBe(before);
  });

  it("passes a writer's issue through and produces no file", () => {
    const issue = { code: "NOT_NOTATABLE" as const, message: "2마디: 기보할 수 없는 길이", measureNumber: 2 };
    expect(exportScore(tiedScore(), port(() => ({ ok: false, issue })))).toEqual({ ok: false, issue });
  });

  it("rejects an invalid score before calling the writer", () => {
    let called = false;
    const result = exportScore({ ...tiedScore(), tempoBpm: 0 }, port(() => { called = true; return { ok: true, data: "" }; }));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SCORE" } });
    expect(called).toBe(false);
  });
});
