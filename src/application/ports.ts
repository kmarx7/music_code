import type { Score } from "@/domain/score/types";

export interface ScoreSummary {
  id: string;
  title: string;
  updatedAt: string;
  revision: number;
}

/** Storage metadata is not music content and never enters edit history/JSON backups. */
export interface ScoreSnapshot { score: Score; revision: number }
export interface ScoreChange { id: string; revision: number; kind: "saved" | "deleted" }
export interface ScoreRepository {
  list(): Promise<ScoreSummary[]>;
  /** Read-only compatibility projection. null means truly absent, never deleted/unreadable. */
  load(id: string): Promise<Score | null>;
  read(id: string): Promise<ScoreSnapshot | null>;
  create(score: Score): Promise<number>;
  save(score: Score, expectedRevision: number): Promise<number>;
  delete(id: string, expectedRevision: number): Promise<number>;
  subscribe?(listener: (change: ScoreChange) => void): () => void;
}
export class ScoreConflictError extends Error {
  constructor(public readonly code: "CONFLICT" | "DELETED", message = "다른 탭에서 악보가 변경되거나 삭제되었습니다.") {
    super(message); this.name = "ScoreConflictError";
  }
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
