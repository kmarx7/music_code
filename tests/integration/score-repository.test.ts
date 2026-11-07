import { persist } from "../fixtures/persist";
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { createEmptyScore, createNoteEvent } from "@/domain/score/create";
import { serializeScore } from "@/domain/score/serialize";
import { applyEditCommand } from "@/domain/commands/apply";

let dbCounter = 0;
function freshRepository() {
  dbCounter += 1;
  return createIndexedDbScoreRepository({ dbName: `test-db-${dbCounter}` });
}

function scoreWith(id: string, updatedAt: string, noteId: string) {
  const base = createEmptyScore({
    id,
    title: `Score ${id}`,
    measureCount: 2,
    createdAt: "2026-11-07T00:00:00.000Z",
  });
  const withNote = applyEditCommand(base, {
    type: "AddNote",
    partId: base.parts[0].id,
    measureId: base.parts[0].measures[0].id,
    note: createNoteEvent({ id: noteId, step: "C", octave: 4, startTick: 0, durationTicks: 960 }),
  });
  if (!withNote.ok) throw new Error("fixture apply failed");
  return { ...withNote.score, updatedAt };
}

function putRaw(
  dbName: string,
  record: { id: string; updatedAt: string; json: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("scores", "readwrite");
      tx.objectStore("scores").put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe("IndexedDB ScoreRepository", () => {
  it("saves and loads a score without data loss", async () => {
    const repository = freshRepository();
    const score = scoreWith("score-a", "2026-11-07T01:00:00.000Z", "n1");

    await persist(repository, score);
    const loaded = await repository.load("score-a");

    expect(loaded).toEqual(score);
    expect(loaded?.parts[0].measures[0].events).toHaveLength(1);
  });

  it("returns null for a missing score", async () => {
    const repository = freshRepository();
    expect(await repository.load("nope")).toBeNull();
  });

  it("lists summaries sorted by updatedAt descending", async () => {
    const repository = freshRepository();
    await persist(repository, scoreWith("old", "2026-11-07T01:00:00.000Z", "a"));
    await persist(repository, scoreWith("new", "2026-11-07T05:00:00.000Z", "b"));

    const list = await repository.list();
    expect(list.map((item) => item.id)).toEqual(["new", "old"]);
    expect(list[0].title).toBe("Score new");
  });

  it("deletes a score", async () => {
    const repository = freshRepository();
    await persist(repository, scoreWith("score-del", "2026-11-07T01:00:00.000Z", "a"));
    await repository.delete("score-del", 1);

    await expect(repository.load("score-del")).rejects.toMatchObject({ code: "DELETED" });
    expect(await repository.list()).toHaveLength(0);
  });

  it("ignores corrupt records instead of overwriting them", async () => {
    const dbName = `test-db-corrupt-${Date.now()}`;
    const repository = createIndexedDbScoreRepository({ dbName });
    const score = scoreWith("corrupt", "2026-11-07T01:00:00.000Z", "a");
    await persist(repository, score);
    await putRaw(dbName, { id: "corrupt", updatedAt: score.updatedAt, json: "{not-json" });

    await expect(repository.load("corrupt")).rejects.toMatchObject({ code: "INVALID_JSON" });
    expect(await repository.list()).toHaveLength(0);
  });

  it("rejects unsupported schema versions on load", async () => {
    const dbName = `test-db-schema-${Date.now()}`;
    const repository = createIndexedDbScoreRepository({ dbName });
    const score = scoreWith("schema", "2026-11-07T01:00:00.000Z", "a");
    await persist(repository, score);
    await putRaw(dbName, {
      id: "schema",
      updatedAt: score.updatedAt,
      json: serializeScore({ ...score, schemaVersion: 999 }),
    });

    await expect(repository.load("schema")).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEMA" });
  });
});

it("rejects a transaction aborted after a successful put instead of reporting saved", async () => {
  const repository = freshRepository();
  const initial = scoreWith("abort", "2026-11-08T01:00:00.000Z", "note-abort");
  await persist(repository, initial);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args) {
    const request = original.apply(this, args);
    request.addEventListener("success", () => request.transaction!.abort());
    return request;
  });
  try {
    await expect(persist(repository, { ...initial, title: "아직 커밋 안 됨" })).rejects.toThrow();
  } finally { spy.mockRestore(); }
  expect(await repository.load(initial.id)).toEqual(initial);
});
