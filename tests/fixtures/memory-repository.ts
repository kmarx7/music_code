import { ScoreConflictError, ScoreReadError, type ScoreRepository, type ScoreSummary } from "@/application/ports";
import type { Score } from "@/domain/score/types";
import { deserializeScore, serializeScore } from "@/domain/score/serialize";

/**
 * 테스트용 인메모리 ScoreRepository.
 * 프로덕션 코드가 아닌 테스트 대역이며 canonical Score를 복제하지 않는다.
 */
export class MemoryScoreRepository implements ScoreRepository {
  subscribe?: ScoreRepository["subscribe"];
  private records = new Map<string, string>();

  private revisions = new Map<string, number>();
  private deleted = new Set<string>();

  async list(): Promise<ScoreSummary[]> {
    const summaries: ScoreSummary[] = [];
    for (const json of this.records.values()) {
      const parsed = deserializeScore(json);
      if (!parsed.ok) continue;
      summaries.push({
        id: parsed.score.id,
        revision: this.revisions.get(parsed.score.id)!,
        title: parsed.score.title,
        updatedAt: parsed.score.updatedAt,
      });
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<Score | null> {
    if (this.deleted.has(id)) throw new ScoreConflictError("DELETED");
    const json = this.records.get(id);
    if (json === undefined) return null;
    const parsed = deserializeScore(json);
    if (!parsed.ok) throw new ScoreReadError(parsed.code, parsed.message);
    return parsed.score;
  }

  async read(id: string) {
    const score = await this.load(id);
    return score ? { score, revision: this.revisions.get(id)! } : null;
  }
  async create(score: Score): Promise<number> {
    if (this.deleted.has(score.id)) throw new ScoreConflictError("DELETED");
    if (this.records.has(score.id)) throw new ScoreConflictError("CONFLICT");
    this.records.set(score.id, serializeScore(score)); this.revisions.set(score.id, 1); return 1;
  }
  async save(score: Score, expectedRevision: number): Promise<number> {
    if (this.deleted.has(score.id)) throw new ScoreConflictError("DELETED");
    if (this.revisions.get(score.id) !== expectedRevision) throw new ScoreConflictError("CONFLICT");
    this.records.set(score.id, serializeScore(score));
    this.revisions.set(score.id, expectedRevision + 1); return expectedRevision + 1;
  }
  async delete(id: string, expectedRevision: number): Promise<number> {
    if (this.revisions.get(id) !== expectedRevision) throw new ScoreConflictError("CONFLICT");
    this.records.delete(id); this.deleted.add(id); this.revisions.set(id, expectedRevision + 1); return expectedRevision + 1;
  }

  size(): number {
    return this.records.size;
  }
}
