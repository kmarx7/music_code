import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
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

    await repository.save(score);
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
    await repository.save(scoreWith("old", "2026-11-07T01:00:00.000Z", "a"));
    await repository.save(scoreWith("new", "2026-11-07T05:00:00.000Z", "b"));

    const list = await repository.list();
    expect(list.map((item) => item.id)).toEqual(["new", "old"]);
    expect(list[0].title).toBe("Score new");
  });

  it("deletes a score", async () => {
    const repository = freshRepository();
    await repository.save(scoreWith("score-del", "2026-11-07T01:00:00.000Z", "a"));
    await repository.delete("score-del");

    expect(await repository.load("score-del")).toBeNull();
    expect(await repository.list()).toHaveLength(0);
  });

  it("ignores corrupt records instead of overwriting them", async () => {
    const dbName = `test-db-corrupt-${Date.now()}`;
    const repository = createIndexedDbScoreRepository({ dbName });
    const score = scoreWith("corrupt", "2026-11-07T01:00:00.000Z", "a");
    await repository.save(score);
    await putRaw(dbName, { id: "corrupt", updatedAt: score.updatedAt, json: "{not-json" });

    expect(await repository.load("corrupt")).toBeNull();
    expect(await repository.list()).toHaveLength(0);
  });

  it("rejects unsupported schema versions on load", async () => {
    const dbName = `test-db-schema-${Date.now()}`;
    const repository = createIndexedDbScoreRepository({ dbName });
    const score = scoreWith("schema", "2026-11-07T01:00:00.000Z", "a");
    await repository.save(score);
    await putRaw(dbName, {
      id: "schema",
      updatedAt: score.updatedAt,
      json: serializeScore({ ...score, schemaVersion: 999 }),
    });

    expect(await repository.load("schema")).toBeNull();
  });
});
