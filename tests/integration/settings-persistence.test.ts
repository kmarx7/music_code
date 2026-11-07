import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { createScoreStore } from "@/store/score-store";
import { baseScore, tiedScore } from "../fixtures/scores";

it("persists tempo/key changes with unchanged pitches and ties", async () => {
  const dbName = "settings-persistence";
  const repository = createIndexedDbScoreRepository({ dbName });
  const initial = tiedScore();
  const store = createScoreStore();
  store.init(initial);
  expect(store.dispatch({ type: "SetTempo", tempoBpm: 90, updatedAt: "2026-11-08T01:00:00.000Z" })?.ok).toBe(true);
  expect(store.dispatch({ type: "SetKeySignature", partId: initial.parts[0].id,
    keySignature: { tonic: "B", alter: -1, mode: "major", fifths: -2 }, updatedAt: "2026-11-08T01:01:00.000Z" })?.ok).toBe(true);
  const changed = store.getState()!.current;
  await repository.save(changed);
  const reopened = createIndexedDbScoreRepository({ dbName });
  expect(await reopened.load(initial.id)).toEqual(changed);
  expect(changed.parts[0].measures).toEqual(initial.parts[0].measures);
  expect(changed.parts[0].ties).toEqual(initial.parts[0].ties);
  store.undo(); store.undo();
  await repository.save(store.getState()!.current);
  expect(await reopened.load(initial.id)).toEqual(initial);
});

it("restores an empty score meter and its original value after undo", async () => {
  const initial = baseScore();
  const repository = createIndexedDbScoreRepository({ dbName: "meter-persistence" });
  const store = createScoreStore();
  store.init(initial);
  expect(store.dispatch({ type: "SetTimeSignature", partId: initial.parts[0].id,
    timeSignature: { numerator: 6, denominator: 8 }, updatedAt: "2026-11-08T01:00:00.000Z" })?.ok).toBe(true);
  await repository.save(store.getState()!.current);
  expect((await repository.load(initial.id))!.parts[0].timeSignature).toEqual({ numerator: 6, denominator: 8 });
  store.undo();
  await repository.save(store.getState()!.current);
  expect(await repository.load(initial.id)).toEqual(initial);
});
