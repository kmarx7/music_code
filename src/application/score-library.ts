import { ScoreConflictError, type ScoreRepository, type ScoreSummary } from "@/application/ports";
import type { KeySignature, Score, TimeSignature } from "@/domain/score/types";
import type { ClipboardPayload } from "@/domain/score/clipboard";
import { applyEditCommand } from "@/domain/commands";
import { planTranscriptionCommit } from "@/application/transcription";
import { createEmptyScore, type CreateScoreInput } from "@/domain/score/create";
import { validateScore } from "@/domain/score/validate";
import { deserializeScore, serializeScore } from "@/domain/score";
import { exportFileName } from "@/application/export";

/** 현재 Score를 표준 JSON으로 백업한다. 연습/UI 상태는 포함되지 않는다. */
export function exportScoreBackup(score: Score): { json: string; filename: string } {
  const json = serializeScore(score);
  const validated = deserializeScore(json);
  if (!validated.ok) throw new Error(validated.message);
  return { json, filename: exportFileName(score.title, "json") };
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
  await repository.create(score);
  return { score, migrated: parsed.migrated };
}

export interface OpenScoreResult {
  score: Score;
  created: boolean;
  revision: number;
}

/**
 * 저장된 악보를 불러오고, 실제로 없을 때만 새 악보를 생성해 저장한다.
 * ScoreReadError 등 읽기 실패는 호출자에 전달하며 새 저장을 수행하지 않는다.
 * id/시각은 경계에서 주입한다(재현성).
 */
export async function openOrCreateScore(
  repository: ScoreRepository,
  input: { id: string; createdAt: string; title?: string; measureCount?: number },
): Promise<OpenScoreResult> {
  const existing = await repository.read(input.id);
  if (existing) return { ...existing, created: false };

  const score = createEmptyScore({
    id: input.id,
    title: input.title ?? "새 악보",
    measureCount: input.measureCount ?? 8,
    createdAt: input.createdAt,
  });
  try {
    const revision = await repository.create(score);
    return { score, revision, created: true };
  } catch (error) {
    // Concurrent first opens (including development StrictMode) may create the ID first.
    // No edit session exists yet: read the winner, never retry a write or replace its content.
    if (error instanceof ScoreConflictError && error.code === "CONFLICT") {
      const winner = await repository.read(input.id);
      if (winner) return { ...winner, created: false };
    }
    throw error;
  }
}

/** Settings a new score may start with (Phase 7 A-2 `/new`). Everything else uses the empty-score defaults. */
export interface NewScoreInput {
  id: string;
  createdAt: string;
  title?: string;
  measureCount?: number;
  tempoBpm?: number;
  timeSignature?: CreateScoreInput["timeSignature"];
  keySignature?: CreateScoreInput["keySignature"];
  instrument?: CreateScoreInput["instrument"];
}

/** Creates and saves one empty score. Invalid settings are refused before anything is written. */
export async function createNewScore(repository: ScoreRepository, input: NewScoreInput): Promise<Score> {
  const title = (input.title ?? "새 악보").trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  const score = createEmptyScore({
    id: input.id,
    title,
    measureCount: input.measureCount ?? 8,
    tempoBpm: input.tempoBpm,
    timeSignature: input.timeSignature,
    keySignature: input.keySignature,
    instrument: input.instrument,
    createdAt: input.createdAt,
  });
  const issues = validateScore(score);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(" "));
  await repository.create(score);
  return score;
}

export function listScores(repository: ScoreRepository): Promise<ScoreSummary[]> {
  return repository.list();
}

/**
 * True when the score storage can be used at all (P6-05). Listing skips unreadable records, so only a storage
 * that cannot be opened (private modes, blocked site data, missing IndexedDB) reports false. A single corrupt
 * record keeps its own protective read error instead.
 */
export async function probeScoreStorage(repository: ScoreRepository): Promise<boolean> {
  try { await repository.list(); return true; } catch { return false; }
}

export interface TranscribedScoreInput {
  id: string;
  createdAt: string;
  setup: { title: string; tempoBpm: number; timeSignature: TimeSignature; keySignature: KeySignature; instrument?: CreateScoreInput["instrument"] };
  /** The confirmed take (transcription candidate). */
  clipboard: ClipboardPayload;
  /** Measure ids for the measures the take adds beyond the first eight. */
  nextId: () => string;
}

/**
 * The score "악보 만들기" would save (Phase 7 decision 2): an empty score with the step-1 settings and the take
 * pasted from measure 1 through the same PasteEvents command the editor uses. Pure; nothing is stored.
 */
export function buildTranscribedScore(input: TranscribedScoreInput): { ok: true; score: Score } | { ok: false; message: string } {
  const empty = createEmptyScore({ id: input.id, measureCount: 8, createdAt: input.createdAt, ...input.setup });
  const plan = planTranscriptionCommit(empty, input.clipboard, { target: "end", cursorTick: null, nextMeasureId: input.nextId });
  if (!plan.ok) return plan;
  const applied = applyEditCommand(empty, plan.command);
  if (!applied.ok) return { ok: false, message: applied.error.message };
  const issues = validateScore(applied.score);
  if (issues.length > 0) return { ok: false, message: issues.map((issue) => issue.message).join(" ") };
  // A new score starts with its own creation time, not the command's edit time.
  return { ok: true, score: { ...applied.score, updatedAt: input.createdAt } };
}

/** Saves the score built from a confirmed take. One call = one score; a failed build writes nothing. */
export async function createTranscribedScore(repository: ScoreRepository, input: TranscribedScoreInput): Promise<Score> {
  const built = buildTranscribedScore(input);
  if (!built.ok) throw new Error(built.message);
  await repository.create(built.score);
  return built.score;
}
