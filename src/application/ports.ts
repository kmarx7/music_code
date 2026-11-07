import type { Score } from "@/domain/score/types";

export interface ScoreSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * 영속 저장 포트. Phase 0에서는 인터페이스만 정의하며
 * IndexedDB 어댑터는 Phase 1에서 구현한다.
 */
export interface ScoreRepository {
  list(): Promise<ScoreSummary[]>;
  /** null only for absent IDs; unreadable records reject with ScoreReadError. */
  load(id: string): Promise<Score | null>;
  save(score: Score): Promise<void>;
  delete(id: string): Promise<void>;
}

export type ScoreReadErrorCode =
  | "INVALID_RECORD"
  | "INVALID_JSON"
  | "INVALID_SHAPE"
  | "INVALID_SCORE"
  | "UNSUPPORTED_SCHEMA"
  | "STORAGE_READ_ERROR";

/** Storage failures are never equivalent to a missing score. No raw data is rewritten. */
export class ScoreReadError extends Error {
  constructor(public readonly code: ScoreReadErrorCode, message: string) {
    super(message);
    this.name = "ScoreReadError";
  }
}
