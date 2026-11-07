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
  load(id: string): Promise<Score | null>;
  save(score: Score): Promise<void>;
  delete(id: string): Promise<void>;
}
