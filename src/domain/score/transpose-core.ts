import type { KeySignature, Measure, Part, Score, ScoreEvent } from "./types";
import { validateScore } from "./validate";
import { KEY_SIGNATURE_OPTIONS, isSupportedKeySignature } from "../music-theory/key-signatures";
import { intervalBetweenKeys, transposeKeySignature, transposePitch } from "../music-theory/transpose";
import type { TransposeDirection, TransposeInterval, TransposeResult } from "../music-theory/transpose";
import { midiFromSpelling } from "../music-theory/pitch";

export type TransposeSpec =
  | { kind: "semitones"; semitones: number }
  | { kind: "targetKey"; targetKey: KeySignature; direction?: TransposeDirection };
export interface TransposedScore {
  score: Score;
  interval: TransposeInterval;
}

/** Stage the whole transformation locally; return no partial Score on any failure. */
function applyInterval(score: Score, interval: TransposeInterval): TransposeResult<TransposedScore> {
  if (interval.deltaSemitones === 0 && interval.diatonicSteps === 0) {
    return { ok: true, value: { score, interval } };
  }
  const parts: Part[] = [];
  for (const part of score.parts) {
    const key = transposeKeySignature(part.keySignature, interval);
    if (!key.ok) return { ok: false, error: { ...key.error, partId: part.id } };
    const measures: Measure[] = [];
    for (const measure of part.measures) {
      const events: ScoreEvent[] = [];
      for (const event of measure.events) {
        if (event.kind === "rest") { events.push(event); continue; }
        const pitch = transposePitch(event.pitch, interval);
        if (!pitch.ok) return { ok: false, error: { ...pitch.error, partId: part.id, eventId: event.id } };
        events.push({ ...event, pitch: pitch.value });
      }
      measures.push({ ...measure, events });
    }
    parts.push({ ...part, keySignature: key.value, measures });
  }
  const candidate: Score = { ...score, parts };
  const issues = validateScore(candidate);
  if (issues.length) return { ok: false, error: { code: "INVALID_SCORE", message: issues.map((issue) => issue.message).join(" ") } };
  return { ok: true, value: { score: candidate, interval } };
}

/**
 * Pure candidate engine, not an edit or save. Metadata (including updatedAt) is preserved.
 * The first Part anchors target-key intent; the same chromatic AND written interval applies to every Part.
 */
export function transposeScore(score: Score, spec: TransposeSpec): TransposeResult<TransposedScore> {
  const issues = validateScore(score);
  if (issues.length) return { ok: false, error: { code: "INVALID_SCORE", message: issues.map((issue) => issue.message).join(" ") } };
  return transposeValidatedScore(score, spec);
}

/**
 * Same engine without re-validating the INPUT. Precondition: the caller has just seen `validateScore(score)`
 * return no issues for this exact object (e.g. via `transposeScore`). Every produced candidate is still
 * validated in `applyInterval`. Internal to the score domain: not re-exported from the public index.
 */
export function transposeValidatedScore(score: Score, spec: TransposeSpec): TransposeResult<TransposedScore> {
  for (const part of score.parts) {
    if (!isSupportedKeySignature(part.keySignature)) return { ok: false, error: {
      code: "UNSUPPORTED_KEY_SIGNATURE", message: "원본 조표의 으뜸음·모드·fifths가 일치하지 않습니다.", partId: part.id,
    } };
  }
  const source = score.parts[0].keySignature;
  if (spec.kind === "targetKey") {
    const interval = intervalBetweenKeys(source, spec.targetKey, spec.direction);
    return interval.ok ? applyInterval(score, interval.value) : interval;
  }
  if (spec.kind !== "semitones" || !Number.isSafeInteger(spec.semitones)) return { ok: false, error: {
    code: "INVALID_TRANSPOSE", message: "반음 이동량은 안전한 정수여야 합니다.",
  } };
  const delta = spec.semitones === 0 ? 0 : spec.semitones;
  const sourceMidi = midiFromSpelling(source.tonic, source.alter, 4);
  if (!Number.isSafeInteger(sourceMidi + delta)) return { ok: false, error: {
    code: "INVALID_TRANSPOSE", message: "조옮김 계산 범위를 벗어납니다.",
  } };
  // Exact octaves retain the original keys/spellings rather than normalizing enharmonic keys.
  if (delta % 12 === 0) return applyInterval(score, { deltaSemitones: delta, diatonicSteps: delta / 12 * 7 });

  const candidates: { result: TransposedScore; simplicity: number; tendency: number; priority: number }[] = [];
  let firstFailure: TransposeResult<TransposedScore> | undefined;
  KEY_SIGNATURE_OPTIONS.forEach(({ key }, priority) => {
    if (key.mode !== source.mode || ((midiFromSpelling(key.tonic, key.alter, 4) - sourceMidi - delta % 12) % 12) !== 0) return;
    const base = intervalBetweenKeys(source, key);
    if (!base.ok) return;
    if (!Number.isSafeInteger(delta - base.value.deltaSemitones)) {
      firstFailure ??= { ok: false, error: { code: "INVALID_TRANSPOSE", message: "조옮김 계산 범위를 벗어납니다." } }; return;
    }
    const interval = { deltaSemitones: delta,
      diatonicSteps: base.value.diatonicSteps + (delta - base.value.deltaSemitones) / 12 * 7 };
    if (!Number.isSafeInteger(interval.diatonicSteps)) {
      firstFailure ??= { ok: false, error: { code: "INVALID_TRANSPOSE", message: "조옮김 계산 범위를 벗어납니다." } }; return;
    }
    const result = applyInterval(score, interval);
    if (!result.ok) { firstFailure ??= result; return; }
    // Representability and key-consistent interval spelling precede these ranking criteria.
    candidates.push({ result: result.value,
      simplicity: result.value.score.parts.reduce((sum, part) => sum + Math.abs(part.keySignature.fifths), 0),
      tendency: score.parts.reduce((sum, part, index) => sum + (part.keySignature.fifths !== 0 &&
        Math.sign(part.keySignature.fifths) !== Math.sign(result.value.score.parts[index].keySignature.fifths) ? 1 : 0), 0), priority });
  });
  candidates.sort((a, b) => a.simplicity - b.simplicity || a.tendency - b.tendency || a.priority - b.priority);
  return candidates.length ? { ok: true, value: candidates[0].result } : firstFailure ?? { ok: false, error: {
    code: "UNSUPPORTED_KEY_SIGNATURE", message: "모든 Part를 안전하게 옮길 수 있는 지원 조표가 없습니다.",
  } };
}
