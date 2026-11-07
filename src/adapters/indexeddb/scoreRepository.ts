import type { ScoreRepository, ScoreSummary } from "@/application/ports";
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
 * 손상되었거나 미지원 버전인 레코드는 조용히 덮어쓰지 않고 목록에서 제외/무시한다.
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
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const handle = await db();
    const transaction = handle.transaction(STORE_NAME, mode);
    // A request success precedes transaction commit; a later abort must still reject save().
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    });
    const [result] = await Promise.all([
      requestToPromise(run(transaction.objectStore(STORE_NAME))), completed,
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
        const parsed = deserializeScore(record.json);
        if (!parsed.ok) continue;
        summaries.push({
          id: parsed.score.id,
          title: parsed.score.title,
          updatedAt: parsed.score.updatedAt,
        });
      }

      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async load(id: string): Promise<Score | null> {
      const record = await withStore<StoredScore | undefined>(
        "readonly",
        (store) => store.get(id) as IDBRequest<StoredScore | undefined>,
      );
      if (!record) return null;
      const parsed = deserializeScore(record.json);
      return parsed.ok ? parsed.score : null;
    },

    async save(score: Score): Promise<void> {
      const record: StoredScore = {
        id: score.id,
        updatedAt: score.updatedAt,
        json: serializeScore(score),
      };
      await withStore<IDBValidKey>(
        "readwrite",
        (store) => store.put(record) as IDBRequest<IDBValidKey>,
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
