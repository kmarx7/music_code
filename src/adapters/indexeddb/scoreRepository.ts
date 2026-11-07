import { ScoreReadError, type ScoreRepository, type ScoreSummary } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { deserializeScore } from "@/domain/score/serialize";
import { serializeScore } from "@/domain/score/serialize";

const DEFAULT_DB_NAME = "music-score-platform";
const STORE_NAME = "scores";
const DB_VERSION = 1;

interface StoredScore {
  id: string;
  updatedAt: string;
  json: string;
}


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

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * ScoreRepository의 IndexedDB 구현.
 * 저장 시 canonical Score를 직렬화하고, 읽을 때 deserializeScore로 검증한다.
 * 손상되었거나 미지원 버전인 레코드는 조용히 덮어쓰지 않고 목록에서 제외하며, 직접 load/save는 구분 가능한 오류로 거부한다.
 */
export function createIndexedDbScoreRepository(options?: {
  dbName?: string;
}): ScoreRepository {
  const dbName = options?.dbName ?? DEFAULT_DB_NAME;
  let database: Promise<IDBDatabase> | null = null;

  const db = (): Promise<IDBDatabase> => {
    if (!database) database = openDatabase(dbName);
    return database;
  };

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    const handle = await db();
    const transaction = handle.transaction(STORE_NAME, mode);
    // A request success precedes transaction commit; a later abort must still reject save().
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    });
    const operation = run(transaction.objectStore(STORE_NAME));
    const [result] = await Promise.all([
      operation instanceof Promise ? operation : requestToPromise(operation), completed,
    ]);
    return result;
  }

  return {
    async list(): Promise<ScoreSummary[]> {
      const records = await withStore<StoredScore[]>(
        "readonly",
        (store) => store.getAll() as IDBRequest<StoredScore[]>,
      );

      const summaries: ScoreSummary[] = [];
      for (const record of records) {
        try {
          const score = readStoredScore(record);
          summaries.push({ id: score.id, title: score.title, updatedAt: score.updatedAt });
        } catch (error) {
          if (!(error instanceof ScoreReadError)) throw error;
        }
      }

      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async load(id: string): Promise<Score | null> {
      let record: unknown;
      try {
        record = await withStore<unknown>("readonly", (store) => store.get(id));
      } catch {
        throw new ScoreReadError("STORAGE_READ_ERROR", "IndexedDB에서 악보를 읽지 못했습니다.");
      }
      if (record === undefined) return null;
      return readStoredScore(record, id);
    },

    async save(score: Score): Promise<void> {
      const record: StoredScore = {
        id: score.id,
        updatedAt: score.updatedAt,
        json: serializeScore(score),
      };
      await withStore<IDBValidKey>(
        "readwrite",
        (store) => new Promise<IDBValidKey>((resolve, reject) => {
          const existing = store.get(score.id);
          existing.onerror = () => reject(existing.error);
          existing.onsuccess = () => {
            try {
              // Check and put in the same transaction: a late unreadable record is protected too.
              if (existing.result !== undefined) readStoredScore(existing.result, score.id);
              const write = store.put(record);
              write.onsuccess = () => resolve(write.result);
              write.onerror = () => reject(write.error);
            } catch (error) {
              reject(error);
              store.transaction.abort();
            }
          };
        }),
      );
    },

    async delete(id: string): Promise<void> {
      await withStore<undefined>(
        "readwrite",
        (store) => store.delete(id) as IDBRequest<undefined>,
      );
    },
  };
}
