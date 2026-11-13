import { describe, expect, it } from "vitest";
import { probeScoreStorage, ScoreReadError, type ScoreRepository } from "@/application";
import { createUnavailableScoreRepository } from "@/adapters/indexeddb";
import { MemoryScoreRepository } from "../fixtures/memory-repository";
import { tiedScore } from "../fixtures/scores";

describe("probeScoreStorage", () => {
  it("is true when the library can be listed, even if one record is unreadable", async () => {
    expect(await probeScoreStorage(new MemoryScoreRepository())).toBe(true);
  });

  it("is false only when storage itself cannot be opened", async () => {
    const broken = { ...new MemoryScoreRepository(), list: () => Promise.reject(new Error("IndexedDB unavailable")) } as unknown as ScoreRepository;
    expect(await probeScoreStorage(broken)).toBe(false);
    expect(await probeScoreStorage(createUnavailableScoreRepository())).toBe(false);
  });
});

describe("createUnavailableScoreRepository", () => {
  it("never pretends to store anything: every call rejects with a storage error", async () => {
    const repository = createUnavailableScoreRepository();
    await expect(repository.read("x")).rejects.toBeInstanceOf(ScoreReadError);
    await expect(repository.load("x")).rejects.toBeInstanceOf(ScoreReadError);
    await expect(repository.create(tiedScore())).rejects.toThrow("저장소");
    await expect(repository.save(tiedScore(), 1)).rejects.toThrow("저장소");
    await expect(repository.delete("x", 1)).rejects.toThrow("저장소");
  });
});
