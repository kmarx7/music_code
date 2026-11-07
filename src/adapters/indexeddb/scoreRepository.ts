import { ScoreConflictError, ScoreReadError, type ScoreRepository, type ScoreChange } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { deserializeScore, serializeScore } from "@/domain/score/serialize";

const STORE_NAME = "scores";
const DB_VERSION = 2;

/** Validate the envelope and canonical content without modifying the raw record. */
function readStoredScore(record: unknown, expectedId?: string): Score {
  if (!record || typeof record !== "object" || !("id" in record) ||
      typeof record.id !== "string" || !("json" in record) || typeof record.json !== "string" ||
      !("updatedAt" in record) || typeof record.updatedAt !== "string") {
    throw new ScoreReadError("INVALID_RECORD", "저장된 레코드 구조가 올바르지 않습니다.");
  }
  const parsed = deserializeScore(record.json);
  if (!parsed.ok) throw new ScoreReadError(parsed.code, parsed.message);
  if (parsed.score.id !== record.id || (expectedId !== undefined && record.id !== expectedId)) {
    throw new ScoreReadError("INVALID_RECORD", "저장된 ID와 악보 ID가 일치하지 않습니다.");
  }
  return parsed.score;
}


function revisionOf(record: unknown): number {
  if (!record || typeof record !== "object") throw new ScoreReadError("INVALID_RECORD", "잘못된 저장 메타데이터입니다.");
  const revision = "revision" in record ? record.revision : 0;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new ScoreReadError("INVALID_RECORD", "잘못된 revision입니다.");
  }
  return revision as number;
}
function isDeleted(record: unknown): boolean {
  return !!record && typeof record === "object" && "deleted" in record && record.deleted === true;
}
function assertLive(record: unknown, id: string) {
  if (isDeleted(record)) throw new ScoreConflictError("DELETED", "삭제된 악보 ID는 다시 사용할 수 없습니다.");
  const score = readStoredScore(record, id);
  return { score, revision: revisionOf(record) };
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** OCC is authoritative; notification failure never changes a committed write's outcome. */
export function createIndexedDbScoreRepository(options?: { dbName?: string }): ScoreRepository {
  const dbName = options?.dbName ?? "music-score-platform";
  const channelName = `${dbName}:changes`;
  let database: Promise<IDBDatabase> | null = null;
  let obsolete = false;
  const listeners = new Set<(change: ScoreChange) => void>();
  let channel: BroadcastChannel | undefined;
  function notify(change: ScoreChange) {
    let sender: BroadcastChannel | undefined;
    try { sender = new BroadcastChannel(channelName); sender.postMessage(change); }
    catch { /* advisory only */ }
    finally { try { sender?.close(); } catch { /* advisory only */ } }
  }
  function db(): Promise<IDBDatabase> {
    if (obsolete) return Promise.reject(new Error("저장소 버전이 변경되었습니다. JSON 백업 후 페이지를 다시 열어 주세요."));
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error("이전 버전 탭이 저장소 전환을 막고 있습니다. 해당 탭에서 JSON 백업 후 닫고 다시 시도해 주세요."));
      };
      request.onsuccess = () => {
        const handle = request.result;
        if (blocked) { handle.close(); return; }
        handle.onversionchange = () => { obsolete = true; handle.close(); };
        resolve(handle);
      };
      request.onerror = () => reject(new Error("저장소 버전을 열 수 없습니다. 구버전 앱이라면 최신 페이지를 열어 주세요."));
    });
    return database;
  }
  async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const handle = await db();
    const tx = handle.transaction(STORE_NAME, mode);
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    });
    const operation = run(tx.objectStore(STORE_NAME)).catch((error: unknown) => {
      try { tx.abort(); } catch { /* already finished */ }
      throw error;
    });
    const [result] = await Promise.all([operation, completed]);
    return result;
  }
  const read: ScoreRepository["read"] = async (id) => {
    let record: unknown;
    try { record = await transaction("readonly", (store) => requestValue(store.get(id))); }
    catch (error) { throw new ScoreReadError("STORAGE_READ_ERROR", error instanceof Error ? error.message : "IndexedDB 읽기 실패"); }
    return record === undefined ? null : assertLive(record, id);
  };
  async function write(id: string, score: Score | null, expected: number | null): Promise<number> {
    const json = score ? serializeScore(score) : undefined;
    const revision = await transaction("readwrite", async (store) => {
      const previous: unknown = await requestValue(store.get(id));
      if (isDeleted(previous)) throw new ScoreConflictError("DELETED");
      if (previous !== undefined) assertLive(previous, id); // protect unreadable raw records
      if (expected === null) {
        if (previous !== undefined) throw new ScoreConflictError("CONFLICT");
      } else if (!Number.isSafeInteger(expected) || expected < 0 || previous === undefined || revisionOf(previous) !== expected) {
        throw new ScoreConflictError("CONFLICT");
      }
      const next = (expected ?? 0) + 1;
      if (!Number.isSafeInteger(next)) throw new Error("revision 범위 초과");
      await requestValue(store.put(score
        ? { id, revision: next, updatedAt: score.updatedAt, json }
        : { id, revision: next, deleted: true, deletedAt: new Date().toISOString() }));
      return next;
    });
    notify({ id, revision, kind: score ? "saved" : "deleted" });
    return revision;
  }
  function update(id: string, score: Score | null, expectedRevision: number): Promise<number> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return Promise.reject(new ScoreConflictError("CONFLICT", "수정·삭제에는 유효한 expectedRevision이 필요합니다."));
    return write(id, score, expectedRevision);
  }
  return {
    read,
    async load(id) { return (await read(id))?.score ?? null; },
    async list() {
      const records: unknown[] = await transaction("readonly", (store) => requestValue(store.getAll()));
      return records.flatMap((record) => {
        try {
          if (isDeleted(record)) return [];
          const score = readStoredScore(record);
          return [{ id: score.id, title: score.title, updatedAt: score.updatedAt, revision: revisionOf(record) }];
        } catch (error) { if (!(error instanceof ScoreReadError)) throw error; return []; }
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    create: (score) => write(score.id, score, null),
    save: (score, expectedRevision) => update(score.id, score, expectedRevision),
    delete: (id, expectedRevision) => update(id, null, expectedRevision),
    subscribe(listener) {
      listeners.add(listener);
      if (!channel) try {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = (event: MessageEvent<unknown>) => {
          const value = event.data;
          if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" ||
            !("revision" in value) || !Number.isSafeInteger(value.revision) || !("kind" in value) ||
            (value.kind !== "saved" && value.kind !== "deleted")) return;
          for (const receive of listeners) receive(value as ScoreChange);
        };
      } catch { /* OCC still protects every write */ }
      return () => { listeners.delete(listener); if (!listeners.size) { channel?.close(); channel = undefined; } };
    },
  };
}
