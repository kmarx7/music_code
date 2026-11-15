import {
  analyzeInstrumentFit, planPartNotation, transposeScore, validateScore,
} from "@/domain/score";
import type { ClipboardPayload, InstrumentId, MelodySettings, Score, TransposeSpec } from "@/domain/score";
import type { ScoreRepository } from "@/application/ports";
import { buildTranscribedScore } from "@/application/score-library";

/*
 * The score "악보 올리기" saves (Phase 8 step 1): the extracted melody pasted into a new score with the same
 * command the recording flow uses, optionally moved to another key, then checked like any saved score.
 * One instrument choice and one optional transposition; nothing else from the file is kept.
 */

export interface ImportedScoreInput {
  id: string;
  createdAt: string;
  settings: MelodySettings;
  clipboard: ClipboardPayload;
  instrument: InstrumentId;
  transpose: TransposeSpec | null;
  nextId: () => string;
}

export function buildImportedScore(input: ImportedScoreInput): { ok: true; score: Score } | { ok: false; message: string } {
  const base = buildTranscribedScore({
    id: input.id, createdAt: input.createdAt, setup: { ...input.settings, instrument: input.instrument },
    clipboard: input.clipboard, nextId: input.nextId,
  });
  if (!base.ok) return base;
  let score = base.score;
  if (input.transpose) {
    const moved = transposeScore(score, input.transpose);
    if (!moved.ok) return { ok: false, message: `조를 옮길 수 없습니다. ${moved.error.message}` };
    score = { ...moved.value.score, updatedAt: input.createdAt };
  }
  const clef = analyzeInstrumentFit(score, input.instrument).suggestedClef;
  if (clef && clef !== score.parts[0]!.clef) {
    score = { ...score, parts: score.parts.map((part, index) => (index === 0 ? { ...part, clef } : part)) };
  }
  const issues = validateScore(score);
  if (issues.length > 0) return { ok: false, message: issues.map((issue) => issue.message).join(" ") };
  for (const part of score.parts) {
    const plan = planPartNotation(part);
    if (!plan.ok) return { ok: false, message: plan.issue.message };
  }
  return { ok: true, score };
}

/** Saves the imported score. One call = one score; a failed build writes nothing. */
export async function createImportedScore(repository: ScoreRepository, input: ImportedScoreInput): Promise<Score> {
  const built = buildImportedScore(input);
  if (!built.ok) throw new Error(built.message);
  await repository.create(built.score);
  return built.score;
}
