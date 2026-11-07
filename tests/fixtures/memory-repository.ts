import type { ScoreRepository, ScoreSummary } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { deserializeScore, serializeScore } from "@/domain/score/serialize";

/**
 * 테스트용 인메모리 ScoreRepository.
 * 프로덕션 코드가 아닌 테스트 대역이며 canonical Score를 복제하지 않는다.
 */
export class MemoryScoreRepository implements ScoreRepository {
  private records = new Map<string, string>();

  async list(): Promise<ScoreSummary[]> {
    const summaries: ScoreSummary[] = [];
    for (const json of this.records.values()) {
      const parsed = deserializeScore(json);
      if (!parsed.ok) continue;
      summaries.push({
        id: parsed.score.id,
        title: parsed.score.title,
        updatedAt: parsed.score.updatedAt,
      });
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<Score | null> {
    const json = this.records.get(id);
    if (!json) return null;
    const parsed = deserializeScore(json);
    return parsed.ok ? parsed.score : null;
  }

  async save(score: Score): Promise<void> {
    this.records.set(score.id, serializeScore(score));
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  size(): number {
    return this.records.size;
  }
}
