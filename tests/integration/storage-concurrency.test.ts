import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createIndexedDbScoreRepository } from "@/adapters/indexeddb/scoreRepository";
import { openOrCreateScore } from "@/application";
import { tiedScore, FIXTURE_CREATED_AT } from "../fixtures/scores";

let counter = 0;
function setup() {
  const dbName = `occ-${++counter}`;
  const a = createIndexedDbScoreRepository({ dbName });
  const b = createIndexedDbScoreRepository({ dbName });
  return { dbName, a, b, score: tiedScore() };
}
async function open(name: string, version?: number) {
  const request = indexedDB.open(name, version);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains("scores")) request.result.createObjectStore("scores", { keyPath: "id" });
  };
  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function raw(name: string, id: string, value?: unknown) {
  const db = await open(name);
  try {
    const tx = db.transaction("scores", value === undefined ? "readonly" : "readwrite");
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    const request = value === undefined ? tx.objectStore("scores").get(id) : tx.objectStore("scores").put(value);
    const result = await new Promise<unknown>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await done; return result;
  } finally { db.close(); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("two concurrent creates cannot replace each other", async () => {
  const { a, b, score } = setup();
  const results = await Promise.allSettled([a.create(score), b.create({ ...score, title: "other" })]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toMatchObject([{ reason: { code: "CONFLICT" } }]);
  expect((await a.read(score.id))!.revision).toBe(1);
});
it("only one writer using the same revision commits; old content and ties are protected", async () => {
  const { a, b, score } = setup(); await a.create(score);
  const results = await Promise.allSettled([a.save({ ...score, title: "A" }, 1), b.save({ ...score, title: "B" }, 1)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toMatchObject([{ reason: { code: "CONFLICT" } }]);
  const stored = await a.read(score.id);
  expect(stored!.revision).toBe(2); expect(stored!.score.parts).toEqual(score.parts);
});
it.each(["save-first", "delete-first"])("save/delete race is atomic: %s", async (order) => {
  const { dbName, a, b, score } = setup(); await a.create(score);
  const results = await Promise.allSettled(order === "save-first"
    ? [a.save({ ...score, title: "winner" }, 1), b.delete(score.id, 1)]
    : [a.delete(score.id, 1), b.save({ ...score, title: "loser" }, 1)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const record = await raw(dbName, score.id);
  expect(record).toMatchObject({ revision: 2 });
  if (order === "delete-first") expect(record).toMatchObject({ deleted: true });
  else expect(await a.load(score.id)).toMatchObject({ title: "winner" });
});
it("tombstones block stale writes, explicit creates and direct-route creation forever", async () => {
  const { dbName, a, b, score } = setup(); await a.create(score); await b.delete(score.id, 1);
  const before = await raw(dbName, score.id);
  await expect(a.save(score, 1)).rejects.toMatchObject({ code: "DELETED" });
  await expect(a.create(score)).rejects.toMatchObject({ code: "DELETED" });
  await expect(openOrCreateScore(a, { id: score.id, createdAt: FIXTURE_CREATED_AT })).rejects.toMatchObject({ code: "DELETED" });
  expect(await a.list()).toEqual([]); expect(await raw(dbName, score.id)).toEqual(before);
});
it("a stale library list cannot delete a more recent edit", async () => {
  const { a, b, score } = setup(); await a.create(score); const [summary] = await a.list();
  await b.save({ ...score, title: "new" }, 1);
  await expect(a.delete(summary.id, summary.revision)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await a.load(score.id)).toMatchObject({ title: "new" });
});
it("abort after put success preserves raw record and revision and emits no notification", async () => {
  const { dbName, a, score } = setup(); await a.create(score); const before = await raw(dbName, score.id);
  const post = vi.fn(); vi.stubGlobal("BroadcastChannel", class { postMessage = post; close() {} });
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, ...args) {
    const request = original.apply(this, args); request.addEventListener("success", () => request.transaction!.abort()); return request;
  });
  await expect(a.save({ ...score, title: "abort" }, 1)).rejects.toThrow();
  expect(await raw(dbName, score.id)).toEqual(before); expect(post).not.toHaveBeenCalled();
});
it("legacy records read at revision zero unchanged and transition lazily on a valid edit", async () => {
  const { dbName, a, score } = setup(); const old = await open(dbName, 1); old.close();
  const record = { id: score.id, updatedAt: score.updatedAt, json: JSON.stringify(score), extra: "preserve-on-read" };
  await raw(dbName, score.id, record);
  expect(await a.read(score.id)).toEqual({ score, revision: 0 });
  expect(await raw(dbName, score.id)).toEqual(record);
  expect(await a.save({ ...score, title: "edited" }, 0)).toBe(1);
  expect((await a.read(score.id))!.score.parts).toEqual(score.parts);
});
it("blocked upgrade reports an actionable error without touching legacy data", async () => {
  const { dbName, a, score } = setup(); const old = await open(dbName, 1);
  const record = { id: score.id, updatedAt: score.updatedAt, json: JSON.stringify(score) };
  await raw(dbName, score.id, record);
  await expect(a.read(score.id)).rejects.toThrow("JSON 백업");
  const read = old.transaction("scores", "readonly").objectStore("scores").get(score.id);
  const actual = await new Promise<unknown>((resolve) => { read.onsuccess = () => resolve(read.result); });
  expect(actual).toEqual(record);
  old.close();
});
it("versionchange closes new connections and prevents their further writes; v1 open is rejected", async () => {
  const { dbName, a, score } = setup(); await a.create(score);
  const future = await open(dbName, 3); future.close();
  await expect(a.save(score, 1)).rejects.toThrow("버전이 변경");
  await expect(open(dbName, 1)).rejects.toMatchObject({ name: "VersionError" });
  expect(await raw(dbName, score.id)).toMatchObject({ revision: 1, json: JSON.stringify(score) });
});
it.each(["unavailable", "throws"])("OCC survives BroadcastChannel %s", async (mode) => {
  if (mode === "unavailable") vi.stubGlobal("BroadcastChannel", undefined);
  else vi.stubGlobal("BroadcastChannel", class { constructor() { throw new Error("channel blocked"); } });
  const { a, b, score } = setup(); const unsubscribe = a.subscribe!(vi.fn());
  await a.create(score); expect(await b.save(score, 1)).toBe(2);
  await expect(a.save(score, 1)).rejects.toMatchObject({ code: "CONFLICT" }); unsubscribe();
});
it("notifications contain only committed metadata, not Score content", async () => {
  const sent: unknown[] = []; vi.stubGlobal("BroadcastChannel", class { postMessage(value: unknown) { sent.push(value); } close() {} });
  const { a, score } = setup(); await a.create(score); await a.delete(score.id, 1);
  expect(sent).toEqual([{ id: score.id, revision: 1, kind: "saved" }, { id: score.id, revision: 2, kind: "deleted" }]);
});
it("invalid metadata and unsupported Score are never rewritten", async () => {
  const { dbName, a, score } = setup(); await a.create(score);
  for (const patch of [{ revision: -1 }, { json: JSON.stringify({ ...score, schemaVersion: 999 }) }]) {
    const record = { id: score.id, revision: 1, updatedAt: score.updatedAt, json: JSON.stringify(score), ...patch };
    await raw(dbName, score.id, record);
    await expect(a.save(score, 1)).rejects.toThrow(); await expect(a.delete(score.id, 1)).rejects.toThrow();
    expect(await raw(dbName, score.id)).toEqual(record);
  }
});
it("postMessage failure cannot turn a committed write into a failed save", async () => {
  const close = vi.fn();
  vi.stubGlobal("BroadcastChannel", class { postMessage() { throw new Error("send failed"); } close = close; });
  const { a, score } = setup(); expect(await a.create(score)).toBe(1);
  expect(await a.save(score, 1)).toBe(2); expect((await a.read(score.id))!.revision).toBe(2); expect(close).toHaveBeenCalledTimes(2);
});
it("subscription validates advisory messages and closes its channel on unsubscribe", async () => {
  const receivers: { onmessage?: (event: { data: unknown }) => void }[] = [];
  const close = vi.fn();
  vi.stubGlobal("BroadcastChannel", class {
    onmessage?: (event: { data: unknown }) => void;
    constructor() { receivers.push(this); }
    close = close;
  });
  const { a, score } = setup(); const listener = vi.fn(); const unsubscribe = a.subscribe!(listener);
  receivers[0].onmessage?.({ data: { id: score.id, revision: 5, kind: "saved" } });
  receivers[0].onmessage?.({ data: { id: score.id, revision: "bad", kind: "saved" } });
  expect(listener).toHaveBeenCalledExactlyOnceWith({ id: score.id, revision: 5, kind: "saved" });
  unsubscribe(); expect(close).toHaveBeenCalledTimes(1);
});
it("concurrent first opens reuse the committed winner without retrying or overwriting a create", async () => {
  const { a, b, score } = setup();
  const results = await Promise.all([a, b].map((repository, index) => openOrCreateScore(repository,
    { id: score.id, createdAt: FIXTURE_CREATED_AT, title: `first-${index}` })));
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(results[0].score).toEqual(results[1].score);
  expect(results.map((result) => result.revision)).toEqual([1, 1]);
});
it.each([undefined, null, -1, 0.5, NaN])("runtime invalid expectedRevision %s cannot create, modify or delete", async (value) => {
  const { a, score } = setup();
  const revision = value as unknown as number;
  await expect(a.save(score, revision)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await a.load(score.id)).toBeNull();
  await a.create(score);
  await expect(a.save({ ...score, title: "invalid" }, revision)).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(a.delete(score.id, revision)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await a.read(score.id)).toEqual({ score, revision: 1 });
});
