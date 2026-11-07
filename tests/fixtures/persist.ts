import type { ScoreRepository } from "@/application/ports";
import type { Score } from "@/domain/score/types";
/** Single-writer setup for pre-OCC regression fixtures; never used by concurrency tests or production. */
export async function persist(repository: ScoreRepository, score: Score): Promise<number> {
  const stored = await repository.read(score.id);
  return stored ? repository.save(score, stored.revision) : repository.create(score);
}
