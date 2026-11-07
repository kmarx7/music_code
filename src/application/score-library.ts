import type { ScoreRepository, ScoreSummary } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { createEmptyScore } from "@/domain/score/create";
import { deserializeScore, serializeScore } from "@/domain/score";

/** 현재 Score를 표준 JSON으로 백업한다. 연습/UI 상태는 포함되지 않는다. */
export function exportScoreBackup(score: Score): { json: string; filename: string } {
  const json = serializeScore(score);
  const validated = deserializeScore(json);
  if (!validated.ok) throw new Error(validated.message);
  const name = score.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "score";
  return { json, filename: `${name}.json` };
}

/** 가져오기는 항상 새 악보로 저장한다. 원본 ID/음표/타이 관계는 덮어쓰지 않는다. */
export async function importScoreBackup(
  repository: ScoreRepository,
  raw: string,
  input: { id: string; importedAt: string },
): Promise<{ score: Score; migrated: boolean }> {
  const parsed = deserializeScore(raw);
  if (!parsed.ok) throw new Error(parsed.message);
  if (!input.id.trim() || input.id === parsed.score.id ||
      await repository.load(input.id) ||
      (await repository.list()).some((score) => score.id === input.id)) {
    throw new Error("새 악보 ID가 필요합니다. 기존 악보는 변경하지 않았습니다.");
  }
  const score: Score = { ...parsed.score, id: input.id, updatedAt: input.importedAt };
  await repository.save(score);
  return { score, migrated: parsed.migrated };
}

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
