import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { openOrCreateScore, importScoreBackup, ScoreReadError } from "@/application";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { tiedScore, FIXTURE_CREATED_AT } from "../fixtures/scores";

let counter = 0;
function setup() {
  const dbName = `open-preservation-${++counter}`;
  return { dbName, repository: createIndexedDbScoreRepository({ dbName }) };
}
async function raw(dbName: string, id: string, record?: unknown) {
  const request = indexedDB.open(dbName);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore("scores", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction("scores", record === undefined ? "readonly" : "readwrite");
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    const op = record === undefined ? tx.objectStore("scores").get(id) : tx.objectStore("scores").put(record);
    const value = await new Promise<unknown>((resolve, reject) => { op.onsuccess = () => resolve(op.result); op.onerror = () => reject(op.error); });
    await done; return value;
  } finally { db.close(); }
}
const failures = [
  { code: "INVALID_JSON", json: "  { broken JSON\n" },
  { code: "UNSUPPORTED_SCHEMA", json: JSON.stringify({ ...tiedScore(), schemaVersion: 999 }) },
  { code: "INVALID_SCORE", json: JSON.stringify({ ...tiedScore(), tempoBpm: 0 }) },
  { code: "INVALID_SHAPE", json: JSON.stringify({ ...tiedScore(), parts: null }) },
  { code: "INVALID_RECORD", json: 42 },
  { code: "INVALID_RECORD", json: JSON.stringify({ ...tiedScore(), id: "different-id" }) },
];
it.each(failures)("direct open preserves the complete record and never saves on $code", async ({ code, json }) => {
  const { dbName, repository } = setup();
  const original = { id: "score-tie", updatedAt: "original timestamp", json, recovery: { keep: [1, "original"] } };
  await raw(dbName, original.id, original);
  const save = vi.spyOn(repository, "save");
  await expect(openOrCreateScore(repository, { id: original.id, createdAt: FIXTURE_CREATED_AT })).rejects.toMatchObject({ code });
  expect(save).not.toHaveBeenCalled();
  await expect(repository.save(tiedScore())).rejects.toMatchObject({ code });
  expect(await raw(dbName, original.id)).toEqual(original);
  expect(await repository.list()).toEqual([]);
  expect(await raw(dbName, original.id)).toEqual(original);
});

it("creates only genuinely missing IDs", async () => {
  const { repository } = setup(); const save = vi.spyOn(repository, "save");
  const result = await openOrCreateScore(repository, { id: "missing", createdAt: FIXTURE_CREATED_AT });
  expect(result.created).toBe(true); expect(save).toHaveBeenCalledTimes(1);
  expect(await repository.load("missing")).toEqual(result.score);
});
it("opens a normal tied score without any write", async () => {
  const { repository } = setup(); const initial = tiedScore(); await repository.save(initial);
  const save = vi.spyOn(repository, "save");
  expect(await openOrCreateScore(repository, { id: initial.id, createdAt: FIXTURE_CREATED_AT })).toEqual({ score: initial, created: false });
  expect(save).not.toHaveBeenCalled();
});
it("migrates a supported v1 in memory while preserving its original record on read", async () => {
  const { dbName, repository } = setup();
  const current = tiedScore(); current.parts[0].ties = [];
  const v1 = { ...current, schemaVersion: 1, parts: current.parts.map((part) => Object.fromEntries(Object.entries(part).filter(([key]) => key !== "ties"))) };
  const original = { id: current.id, updatedAt: current.updatedAt, json: JSON.stringify(v1) };
  await raw(dbName, current.id, original);
  const opened = await openOrCreateScore(repository, { id: current.id, createdAt: FIXTURE_CREATED_AT });
  expect(opened.score).toEqual(current); expect(opened.created).toBe(false);
  expect(await raw(dbName, current.id)).toEqual(original);
  // A subsequent normal edit/save may persist the supported, validated v2 representation.
  await repository.save({ ...opened.score, title: "edited" });
  expect((await repository.load(current.id))!.schemaVersion).toBe(2);
});
it("read errors are distinct from missing and cannot cause a create", async () => {
  const { dbName, repository } = setup(); const initial = tiedScore(); await repository.save(initial);
  const before = await raw(dbName, initial.id);
  const save = vi.spyOn(repository, "save");
  const spy = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(() => { throw new Error("blocked read"); });
  try {
    await expect(openOrCreateScore(repository, { id: initial.id, createdAt: FIXTURE_CREATED_AT })).rejects.toMatchObject({ code: "STORAGE_READ_ERROR" });
  } finally { spy.mockRestore(); }
  expect(save).not.toHaveBeenCalled(); expect(await raw(dbName, initial.id)).toEqual(before);
});
it("a late invalid record between absence lookup and creation cannot be overwritten", async () => {
  const { dbName, repository } = setup();
  const original = { id: "late", updatedAt: "keep", json: "{broken" };
  const load = repository.load.bind(repository);
  vi.spyOn(repository, "load").mockImplementationOnce(async (id) => {
    const result = await load(id);
    await raw(dbName, id, original);
    return result;
  });
  await expect(openOrCreateScore(repository, { id: "late", createdAt: FIXTURE_CREATED_AT })).rejects.toBeInstanceOf(ScoreReadError);
  expect(await raw(dbName, "late")).toEqual(original);
});
it("JSON import cannot overwrite an unreadable record with the requested new ID", async () => {
  const { dbName, repository } = setup();
  const original = { id: "import-target", updatedAt: "keep", json: "{broken" };
  await raw(dbName, original.id, original);
  await expect(importScoreBackup(repository, JSON.stringify(tiedScore()), { id: original.id, importedAt: FIXTURE_CREATED_AT })).rejects.toMatchObject({ code: "INVALID_JSON" });
  expect(await raw(dbName, original.id)).toEqual(original);
});
