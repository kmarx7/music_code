import { persist } from "../fixtures/persist";
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { createScoreStore } from "@/store/score-store";
import { createRestEvent } from "@/domain/score";
import { tiedScore } from "../fixtures/scores";

it("saves mixed rest/tied-note edits and reopens identical content after undo/redo", async () => {
  const dbName = "rest-persistence";
  const repository = createIndexedDbScoreRepository({ dbName });
  const store = createScoreStore();
  const initial = tiedScore();
  store.init(initial);
  const partId = initial.parts[0].id;
  expect(store.dispatch({ type: "InsertRest", partId, measureId: initial.parts[0].measures[0].id,
    rest: createRestEvent({ id: "r", startTick: 0, durationTicks: 960 }) })?.ok).toBe(true);
  expect(store.dispatch({ type: "UpdateRest", partId, restId: "r", patch: { startTick: 960, durationTicks: 1920 } })?.ok).toBe(true);
  const edited = store.getState()!.current;
  store.undo();
  store.redo();
  expect(store.getState()!.current).toEqual(edited);
  await persist(repository, edited);
  const reopened = createIndexedDbScoreRepository({ dbName });
  expect(await reopened.load(edited.id)).toEqual(edited);
  expect((await reopened.load(edited.id))!.parts[0].ties).toEqual(initial.parts[0].ties);
  expect(edited.schemaVersion).toBe(3);
  expect(store.dispatch({ type: "DeleteEvent", partId, eventId: "r" })?.ok).toBe(true);
  await persist(repository, store.getState()!.current);
  expect(await reopened.load(initial.id)).toEqual(initial);
});
