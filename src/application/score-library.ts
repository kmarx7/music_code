import type { ScoreRepository, ScoreSummary } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { createEmptyScore } from "@/domain/score/create";

export interface OpenScoreResult {
  score: Score;
  created: boolean;
}

/**
 * 저장된 악보를 불러오고, 없으면 새 악보를 생성해 저장한다.
 * id/시각은 경계에서 주입한다(재현성).
 */
export async function openOrCreateScore(
  repository: ScoreRepository,
  input: { id: string; createdAt: string; title?: string; measureCount?: number },
): Promise<OpenScoreResult> {
  const existing = await repository.load(input.id);
  if (existing) return { score: existing, created: false };

  const score = createEmptyScore({
    id: input.id,
    title: input.title ?? "새 악보",
    measureCount: input.measureCount ?? 8,
    createdAt: input.createdAt,
  });
  await repository.save(score);
  return { score, created: true };
}

export async function createNewScore(
  repository: ScoreRepository,
  input: { id: string; createdAt: string; title?: string; measureCount?: number },
): Promise<Score> {
  const score = createEmptyScore({
    id: input.id,
    title: input.title ?? "새 악보",
    measureCount: input.measureCount ?? 8,
    createdAt: input.createdAt,
  });
  await repository.save(score);
  return score;
}

export function listScores(repository: ScoreRepository): Promise<ScoreSummary[]> {
  return repository.list();
}
