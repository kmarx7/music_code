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

  it("lists saved scores", async () => {
    const repository = new MemoryScoreRepository();
    await createNewScore(repository, { id: "a", createdAt: CREATED_AT });
    await createNewScore(repository, { id: "b", createdAt: CREATED_AT });

    const list = await listScores(repository);
    expect(list.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});
