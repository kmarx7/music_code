import { persist } from "../fixtures/persist";
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { applyCommand, createEditSession, exportScoreBackup, importScoreBackup } from "@/application";
import { tiedScore } from "../fixtures/scores";

it("persists a renamed score and restores a JSON backup through IndexedDB without replacing it", async () => {
  const repository = createIndexedDbScoreRepository({ dbName: "phase-1e-roundtrip" });
  const outcome = applyCommand(createEditSession(tiedScore()), {
    type: "RenameScore", title: "복구 연습곡", updatedAt: "2026-11-08T01:00:00.000Z",
  });
  expect(outcome.result.ok).toBe(true);
  const original = outcome.session.current;
  await persist(repository, original);
  const loaded = await repository.load(original.id);
  expect(loaded).toEqual(original);
  const restored = await importScoreBackup(repository, exportScoreBackup(loaded!).json, {
    id: "restored-copy", importedAt: "2026-11-08T02:00:00.000Z",
  });
  const reopenedRepository = createIndexedDbScoreRepository({ dbName: "phase-1e-roundtrip" });
  expect(await reopenedRepository.load(restored.score.id)).toEqual(restored.score);
  expect(await reopenedRepository.load(original.id)).toEqual(original);
  expect(await reopenedRepository.list()).toHaveLength(2);
});
