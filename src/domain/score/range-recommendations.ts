import type { KeySignature, Score } from "./types";
import { transposeScore, transposeValidatedScore, type TransposeSpec } from "./transpose-core";
import { analyzeScoreRange, type RangeAnalysis } from "./range";
import { KEY_SIGNATURE_OPTIONS } from "../music-theory/key-signatures";
import type { TransposeError, TransposeInterval } from "../music-theory/transpose";
import { formatNoteLabel } from "../music-theory/note-label";

export interface TargetMidiRange { readonly minMidi: number; readonly maxMidi: number }
export interface RangeViolation {
  readonly partId: string; readonly eventId: string; readonly name: string; readonly midi: number;
  readonly side: "below" | "above"; readonly excessSemitones: number;
}
export interface RangeRecommendation {
  readonly id: string;
  readonly spec: TransposeSpec;
  readonly interval: TransposeInterval;
  readonly targetKey: KeySignature;
  readonly analysis: RangeAnalysis;
  readonly fits: boolean;
  readonly belowSemitones: number;
  readonly aboveSemitones: number;
  /** One entry per logical attack; tie continuations are not counted twice. */
  readonly violations: readonly RangeViolation[];
}
export type RangeRecommendationResult =
  | { readonly ok: true; readonly analysis: RangeAnalysis; readonly target: TargetMidiRange;
      readonly candidates: readonly RangeRecommendation[];
      readonly rejected: readonly { spec: TransposeSpec; error: TransposeError }[] }
  | { readonly ok: false; readonly error: { code: string; message: string } };

/** Explicit finite search: 15 same-mode keys × 3 directions + 255 sounding shifts (-127..127). */
export function recommendTranspositions(score: Score, target: TargetMidiRange): RangeRecommendationResult {
  if (!Number.isInteger(target.minMidi) || !Number.isInteger(target.maxMidi) || target.minMidi < 0 || target.maxMidi > 127 || target.minMidi > target.maxMidi) {
    return { ok: false, error: { code: "INVALID_TARGET_RANGE", message: "목표 음역은 MIDI 0~127 정수이며 최저값이 최고값 이하여야 합니다." } };
  }
  // Let the existing engine validate Score, spelling and supported source keys, including empty scores.
  const source = transposeScore(score, { kind: "semitones", semitones: 0 });
  if (!source.ok) return source;
  const analysis = analyzeScoreRange(score);
  if (analysis.empty) return { ok: true, analysis, target: { ...target }, candidates: [], rejected: [] };
  const specs: TransposeSpec[] = KEY_SIGNATURE_OPTIONS.filter((option) => option.key.mode === score.parts[0].keySignature.mode)
    .flatMap((option) => (["nearest", "up", "down"] as const).map((direction): TransposeSpec => ({ kind: "targetKey", targetKey: { ...option.key }, direction })));
  for (let semitones = -127; semitones <= 127; semitones++) specs.push({ kind: "semitones", semitones });
  const rejected: { spec: TransposeSpec; error: TransposeError }[] = [];
  const unique = new Map<string, RangeRecommendation>(); const automatic = new Set<string>();
  for (const spec of specs) {
    // `source` above already validated this exact Score object; candidates are still validated one by one.
    const transformed = transposeValidatedScore(score, spec);
    if (!transformed.ok) { rejected.push({ spec, error: transformed.error }); continue; }
    const { score: candidate, interval } = transformed.value;
    // For the unchanged source a fixed chromatic AND diatonic interval determines identical musical output.
    const id = `${interval.deltaSemitones}:${interval.diatonicSteps}`;
    if (spec.kind === "semitones") automatic.add(id);
    if (unique.has(id)) continue;
    const range = analyzeScoreRange(candidate);
    const belowSemitones = Math.max(0, target.minMidi - range.minMidi!);
    const aboveSemitones = Math.max(0, range.maxMidi! - target.maxMidi);
    const violations: RangeViolation[] = [];
    for (const part of candidate.parts) {
      const continuations = new Set(part.ties.map((tie) => tie.to));
      for (const measure of part.measures) for (const event of measure.events) {
        if (event.kind !== "note" || continuations.has(event.id)) continue;
        const midi = event.pitch.midi;
        if (midi < target.minMidi || midi > target.maxMidi) violations.push({
          partId: part.id, eventId: event.id, midi, name: formatNoteLabel(event.pitch, "letter")!,
          side: midi < target.minMidi ? "below" : "above",
          excessSemitones: midi < target.minMidi ? target.minMidi - midi : midi - target.maxMidi,
        });
      }
    }
    unique.set(id, { id, spec, interval, targetKey: { ...candidate.parts[0].keySignature }, analysis: range,
      fits: belowSemitones === 0 && aboveSemitones === 0, belowSemitones, aboveSemitones, violations });
  }
  const keyOrder = (candidate: RangeRecommendation) => KEY_SIGNATURE_OPTIONS.findIndex((option) =>
    option.key.mode === candidate.targetKey.mode && option.key.fifths === candidate.targetKey.fifths);
  const candidates = [...unique.values()].sort((a, b) => Number(b.fits) - Number(a.fits)
    || Math.abs(a.interval.deltaSemitones) - Math.abs(b.interval.deltaSemitones)
    || Number(a.interval.deltaSemitones < 0) - Number(b.interval.deltaSemitones < 0)
    // Reuse the engine's automatic spelling policy, including 0/octave preservation, rather than inventing one.
    || Number(automatic.has(b.id)) - Number(automatic.has(a.id))
    || keyOrder(a) - keyOrder(b) || a.interval.diatonicSteps - b.interval.diatonicSteps);
  return { ok: true, analysis, target: { ...target }, candidates, rejected };
}
