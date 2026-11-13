import { ScoreReadError, type ScoreRepository } from "@/application/ports";

const MESSAGE = "이 브라우저에서는 저장소를 사용할 수 없습니다. 편집 내용은 저장되지 않으니 JSON 백업으로 보관해 주세요.";

/**
 * Stand-in when IndexedDB cannot be opened (P6-05, D-04 #6). Editing continues in memory; every storage call
 * rejects, so autosave reports failure and the leave-page guard stays on. Nothing is ever claimed as saved.
 */
export function createUnavailableScoreRepository(): ScoreRepository {
  const readFailure = () => Promise.reject(new ScoreReadError("STORAGE_READ_ERROR", MESSAGE));
  const writeFailure = () => Promise.reject(new Error(MESSAGE));
  return { list: readFailure, load: readFailure, read: readFailure, create: writeFailure, save: writeFailure, delete: writeFailure };
}
