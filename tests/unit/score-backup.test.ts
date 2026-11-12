import { persist } from "../fixtures/persist";
import { describe, expect, it, vi } from "vitest";
import { applyCommand, createEditSession, redo, undo, exportScoreBackup, importScoreBackup } from "@/application";
import { deserializeScore, serializeScore } from "@/domain/score";
import { MemoryScoreRepository } from "../fixtures/memory-repository";
import { tiedScore } from "../fixtures/scores";

const now = "2026-11-08T00:00:00.000Z";

describe("title editing", () => {
  it("renames through a command with undo/redo and leaves music and snapshots untouched", () => {
    const initial = tiedScore();
    const before = serializeScore(initial);
    const session = createEditSession(initial);
    const outcome = applyCommand(session, { type: "RenameScore", title: "  붙임줄 연습  ", updatedAt: now });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.session.current.title).toBe("붙임줄 연습");
    expect(outcome.session.current.updatedAt).toBe(now);
    expect(outcome.session.current.parts).toBe(initial.parts);
    expect(serializeScore(initial)).toBe(before);
    expect(undo(outcome.session).current).toBe(initial);
    expect(redo(undo(outcome.session)).current).toEqual(outcome.session.current);
  });

  it("rejects a blank title without changing score or history", () => {
    const session = createEditSession(tiedScore());
    const outcome = applyCommand(session, { type: "RenameScore", title: " \n ", updatedAt: now });
    expect(outcome.result).toMatchObject({ ok: false, error: { code: "INVALID_TITLE" } });
    expect(outcome.session).toBe(session);
  });
});

describe("JSON backup and import", () => {
  it("round-trips v2 ties as a new score without changing the existing score", async () => {
    const repository = new MemoryScoreRepository();
    const original = tiedScore();
    await persist(repository, original);
    const backup = exportScoreBackup(original);
    expect(JSON.parse(backup.json)).toEqual(original);
    const result = await importScoreBackup(repository, backup.json, { id: "restored", importedAt: now });
    expect(result.migrated).toBe(false);
    expect(result.score).toEqual({ ...original, id: "restored", updatedAt: now });
    expect(await repository.load("restored")).toEqual(result.score);
    expect(await repository.load(original.id)).toEqual(original);
    expect(repository.size()).toBe(2);
  });

  it("sanitizes filenames while preserving the score title", () => {
    const score = { ...tiedScore(), title: '연습/곡:*?"<>|\\' };
    const backup = exportScoreBackup(score);
    expect(backup.filename).not.toMatch(/[\\/:*?"<>|]/);
    expect(backup.filename.endsWith(".json")).toBe(true);
    expect(JSON.parse(backup.json).title).toBe(score.title);
  });

  it("gives a decomposed (NFD) Hangul title a composed (NFC) filename and leaves the stored title untouched", () => {
    const title = "연습곡".normalize("NFD");
    const backup = exportScoreBackup({ ...tiedScore(), title });
    expect(backup.filename).toBe("연습곡.json");
    expect(backup.filename).toBe(backup.filename.normalize("NFC"));
    expect(JSON.parse(backup.json).title).toBe(title);
    const long = exportScoreBackup({ ...tiedScore(), title: "가".repeat(90).normalize("NFD") });
    expect(long.filename).toBe(`${"가".repeat(80)}.json`);
  });

  it("gives a decomposed (NFD) Hangul title a composed (NFC) filename and leaves the stored title untouched", () => {
    const title = "백업 연습곡".normalize("NFD");
    const backup = exportScoreBackup({ ...tiedScore(), title });
    expect(backup.filename).toBe("백업 연습곡.json");
    expect(backup.filename).toBe(backup.filename.normalize("NFC"));
    expect(JSON.parse(backup.json).title).toBe(title);
    // 80 composed syllables stay whole: the limit is applied after composing.
    const long = exportScoreBackup({ ...tiedScore(), title: "가".repeat(90).normalize("NFD") });
    expect(long.filename).toBe(`${"가".repeat(80)}.json`);
  });

  it("imports a v1 score using the existing v2 migration", async () => {
    const legacy = JSON.parse(serializeScore(tiedScore()));
    legacy.schemaVersion = 1;
    delete legacy.parts[0].ties;
    const result = await importScoreBackup(new MemoryScoreRepository(), JSON.stringify(legacy), {
      id: "legacy-copy", importedAt: now,
    });
    expect(result.migrated).toBe(true);
    expect(result.score.schemaVersion).toBe(2);
    expect(result.score.parts[0].ties).toEqual([]);
  });

  it.each(["", "score-tie", "occupied"])("rejects conflicting/invalid destination ID %j", async (id) => {
    const repository = new MemoryScoreRepository();
    const original = tiedScore();
    await persist(repository, original);
    await persist(repository, { ...original, id: "occupied" });
    await expect(importScoreBackup(repository, serializeScore(original), { id, importedAt: now })).rejects.toThrow("새 악보 ID");
    expect(repository.size()).toBe(2);
    expect(await repository.load(original.id)).toEqual(original);
  });

  it.each([
    "{broken", "null", "[]", JSON.stringify({ ...tiedScore(), schemaVersion: 999 }),
    JSON.stringify({ ...tiedScore(), parts: [null] }),
  ])("rejects bad input without writing: %s", async (raw) => {
    const repository = new MemoryScoreRepository();
    const original = tiedScore();
    await persist(repository, original);
    const save = vi.spyOn(repository, "create");
    await expect(importScoreBackup(repository, raw, { id: "copy", importedAt: now })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load(original.id)).toEqual(original);
  });

  it("reports a storage failure without modifying existing scores", async () => {
    const repository = new MemoryScoreRepository();
    const original = tiedScore();
    await persist(repository, original);
    vi.spyOn(repository, "create").mockRejectedValue(new Error("quota"));
    await expect(importScoreBackup(repository, serializeScore(original), { id: "copy", importedAt: now })).rejects.toThrow("quota");
    expect(await repository.load(original.id)).toEqual(original);
    expect(repository.size()).toBe(1);
  });

  it("refuses to export an invalid score", () => {
    expect(() => exportScoreBackup({ ...tiedScore(), tempoBpm: 0 })).toThrow();
  });
});

describe("untrusted JSON nested shape checks", () => {
  it.each([
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].measures = [null as never]; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].timeSignature = null as never; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].keySignature = null as never; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].measures[0].events = [null as never]; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].measures[0].events[0].kind = "invalid" as never; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].ties = [null as never]; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].ties[0].from = 4 as never; },
    (score: ReturnType<typeof tiedScore>) => { score.parts[0].measures[0].events[0].id = 4 as never; },
  ])("returns a validation failure rather than throwing (%#)", (corrupt) => {
    const score = tiedScore();
    corrupt(score);
    expect(deserializeScore(serializeScore(score))).toMatchObject({ ok: false, code: "INVALID_SHAPE" });
  });

  it("rejects broken ties semantically", () => {
    const score = tiedScore();
    score.parts[0].ties[0].to = "missing";
    expect(deserializeScore(serializeScore(score))).toMatchObject({ ok: false, code: "INVALID_SCORE" });
  });

  it.each([null, { source: { toString: null, valueOf: null } }, { source: "piano", confidence: 2 }])(
    "rejects malformed provenance without throwing (%#)", (provenance) => {
      const score = JSON.parse(serializeScore(tiedScore()));
      score.parts[0].measures[0].events[0].provenance = provenance;
      expect(deserializeScore(JSON.stringify(score))).toMatchObject({ ok: false, code: "INVALID_SHAPE" });
    },
  );
});
