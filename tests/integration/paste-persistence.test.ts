import { persist } from "../fixtures/persist";
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { exportScoreBackup, importScoreBackup, planPaste } from "@/application";
import { copyScoreRange, mergeTiedNotes } from "@/domain/score";
import type { Score } from "@/domain/score";
import { createScoreStore } from "@/store/score-store";
import { tiedScore } from "../fixtures/scores";

const eventsOf = (score: Score) => score.parts[0].measures.flatMap((measure) => measure.events);

it("persists a tied paste with undo/redo, reopen and JSON backup, and keeps a rejected paste out of storage", async () => {
  const dbName = "paste-persistence";
  const repository = createIndexedDbScoreRepository({ dbName });
  const store = createScoreStore(); const initial = tiedScore(); store.init(initial);
  for (const measureId of ["m3", "m4"]) {
    expect(store.dispatch({ type: "AddMeasure", partId: initial.parts[0].id, measureId })?.ok).toBe(true);
  }
  const base = store.getState()!.current;
  await persist(repository, base);

  // Copy never touches the store or the repository.
  const copy = copyScoreRange(base, { startTick: 0, endTick: 7680 });
  if (!copy.ok) throw new Error(copy.message);
  expect(store.getState()!.current).toBe(base);
  expect(await repository.load(base.id)).toEqual(base);

  let next = 0;
  const plan = planPaste(base, copy.clipboard, { startTick: 7680, createId: () => `pasted-${next++}` });
  if (!plan.ok) throw new Error(plan.message);
  expect(store.dispatch(plan.command)?.ok).toBe(true);
  const pasted = store.getState()!.current;
  expect(eventsOf(pasted).map((event) => [event.id, event.startTick])).toEqual([
    ["t1", 2880], ["t1:tie1", 3840], ["pasted-0", 10560], ["pasted-1", 11520],
  ]);
  expect(pasted.parts[0].ties).toEqual([{ from: "t1", to: "t1:tie1" }, { from: "pasted-0", to: "pasted-1" }]);
  expect(mergeTiedNotes(pasted.parts[0]).map((note) => [note.startTick, note.durationTicks]))
    .toEqual([[2880, 1920], [10560, 1920]]);

  // One Undo removes the whole paste; the saved row follows the store exactly.
  store.undo(); expect(store.getState()!.current).toBe(base);
  await persist(repository, store.getState()!.current);
  expect(await repository.load(base.id)).toEqual(base);
  store.redo(); expect(store.getState()!.current).toBe(pasted);
  await persist(repository, pasted);
  const reopened = createIndexedDbScoreRepository({ dbName });
  expect(await reopened.load(base.id)).toEqual(pasted);

  // A second paste onto the now-occupied target is rejected: store, history and storage are unchanged.
  const state = store.getState();
  const again = planPaste(pasted, copy.clipboard, { startTick: 7680, createId: () => `again-${next++}` });
  if (!again.ok) throw new Error(again.message);
  expect(store.dispatch(again.command)).toMatchObject({ ok: false, error: { code: "PASTE_TARGET_OCCUPIED" } });
  expect(store.getState()).toBe(state);
  expect(await reopened.load(base.id)).toEqual(pasted);

  // JSON backup round-trips the pasted events and ties; clipboard/selection never reach Score JSON.
  const backup = exportScoreBackup(pasted);
  expect(backup.json).not.toMatch(/clipboard|selection|lengthTicks/);
  const imported = await importScoreBackup(reopened, backup.json, { id: "paste-imported", importedAt: pasted.updatedAt });
  expect(imported.score.parts).toEqual(pasted.parts);
  expect(pasted.schemaVersion).toBe(2);
});
