import type { ScoreRepository } from "@/application/ports";
import { createIndexedDbScoreRepository } from "./scoreRepository";

let instance: ScoreRepository | null = null;

/**
 * 브라우저 단일 인스턴스. 모듈 로드 시점에는 indexedDB를 건드리지 않는다.
 */
export function getScoreRepository(): ScoreRepository {
  if (!instance) instance = createIndexedDbScoreRepository();
  return instance;
}

export * from "./scoreRepository";
