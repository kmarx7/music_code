import { describe, expect, it } from "vitest";
import {
  createNewScore,
  listScores,
  openOrCreateScore,
} from "@/application/score-library";
import { MemoryScoreRepository } from "../fixtures/memory-repository";

const CREATED_AT = "2026-11-07T00:00:00.000Z";

describe("score library use cases", () => {
  it("creates and saves a score when it does not exist", async () => {
    const repository = new MemoryScoreRepository();

    const result = await openOrCreateScore(repository, {
      id: "score-1",
      createdAt: CREATED_AT,
    });

    expect(result.created).toBe(true);
    expect(result.score.id).toBe("score-1");
    expect(repository.size()).toBe(1);
  });

  it("loads an existing score instead of recreating it", async () => {
    const repository = new MemoryScoreRepository();
    await createNewScore(repository, { id: "score-1", createdAt: CREATED_AT });

    const result = await openOrCreateScore(repository, {
      id: "score-1",
      createdAt: "2026-11-08T00:00:00.000Z",
    });

    expect(result.created).toBe(false);
    expect(result.score.createdAt).toBe(CREATED_AT);
    expect(repository.size()).toBe(1);
  });

  it("creates a new score with a custom title", async () => {
    const repository = new MemoryScoreRepository();
    const score = await createNewScore(repository, {
      id: "score-2",
      createdAt: CREATED_AT,
      title: "연습곡",
    });

    expect(score.title).toBe("연습곡");
    expect(repository.size()).toBe(1);
  });

  it("creates the score for the instrument chosen in step 1 (B-6); without one it is for the piano", async () => {
    const repository = new MemoryScoreRepository();
    const gayageum = await createNewScore(repository, { id: "g", createdAt: CREATED_AT, instrument: "gayageum-25" });
    expect(gayageum.parts[0].instrument).toBe("gayageum-25");
    const piano = await createNewScore(repository, { id: "p", createdAt: CREATED_AT });
    expect(piano.parts[0].instrument).toBe("piano");
  });

  it("lists saved scores", async () => {
    const repository = new MemoryScoreRepository();
    await createNewScore(repository, { id: "a", createdAt: CREATED_AT });
    await createNewScore(repository, { id: "b", createdAt: CREATED_AT });

    const list = await listScores(repository);
    expect(list.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("creates a score with the chosen settings (Phase 7 A-2 /new)", async () => {
    const repository = new MemoryScoreRepository();
    const keySignature = { tonic: "G" as const, alter: 0, mode: "major" as const, fifths: 1 };
    const score = await createNewScore(repository, {
      id: "s", createdAt: CREATED_AT, title: "봄", tempoBpm: 72,
      timeSignature: { numerator: 3, denominator: 4 }, keySignature,
    });
    expect(score.tempoBpm).toBe(72);
    expect(score.parts[0].timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(score.parts[0].keySignature).toEqual(keySignature);
    expect((await repository.read("s"))?.score.tempoBpm).toBe(72);
  });

  it("refuses invalid settings without saving anything", async () => {
    const repository = new MemoryScoreRepository();
    await expect(createNewScore(repository, { id: "bad", createdAt: CREATED_AT, tempoBpm: 9 })).rejects.toThrow(/tempoBpm/);
    await expect(createNewScore(repository, { id: "bad", createdAt: CREATED_AT, title: "   " })).rejects.toThrow();
    expect(repository.size()).toBe(0);
  });
});
