/**
 * Note-level scorer for monophonic transcription (Phase 4, C-09). Test-side only.
 * Definition: docs/PHASE4_MASTER_PLAN.md §5.
 */
export type MelodyNote = { midi: number; startTick: number; durationTicks: number };

export type TranscriptionScore = {
  referenceCount: number; predictedCount: number;
  truePositives: number; falsePositives: number; falseNegatives: number;
  precision: number; recall: number; f1: number;
  /** Unmatched pairs at the same onset whose pitch differs by a multiple of 12. Each is also one miss and one extra. */
  octaveErrors: number;
  /** Unmatched pairs at the same onset with any other pitch difference. Each is also one miss and one extra. */
  pitchErrors: number;
  /** Matched notes whose duration is also identical. Does not affect F1. */
  durationMatches: number;
};

export type ScoreOptions = { onsetToleranceTicks?: number };

export function assertMelodyNote(note: MelodyNote): void {
  if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) throw new RangeError(`Invalid MIDI number: ${note.midi}`);
  if (!Number.isInteger(note.startTick) || note.startTick < 0) throw new RangeError(`Invalid start tick: ${note.startTick}`);
  if (!Number.isInteger(note.durationTicks) || note.durationTicks <= 0) throw new RangeError(`Invalid duration: ${note.durationTicks}`);
}

type Pair = { reference: number; predicted: number; distance: number };

/** Greedy one-to-one pairing, nearest onset first; ties broken by input position so the result is deterministic. */
function pair(reference: readonly MelodyNote[], predicted: readonly MelodyNote[], usedReference: Set<number>,
  usedPredicted: Set<number>, tolerance: number, accept: (a: MelodyNote, b: MelodyNote) => boolean): Pair[] {
  const candidates: Pair[] = [];
  reference.forEach((a, i) => {
    if (usedReference.has(i)) return;
    predicted.forEach((b, j) => {
      if (usedPredicted.has(j)) return;
      const distance = Math.abs(a.startTick - b.startTick);
      if (distance <= tolerance && accept(a, b)) candidates.push({ reference: i, predicted: j, distance });
    });
  });
  candidates.sort((x, y) => x.distance - y.distance || x.reference - y.reference || x.predicted - y.predicted);
  const pairs: Pair[] = [];
  for (const candidate of candidates) {
    if (usedReference.has(candidate.reference) || usedPredicted.has(candidate.predicted)) continue;
    usedReference.add(candidate.reference); usedPredicted.add(candidate.predicted); pairs.push(candidate);
  }
  return pairs;
}

function finish(counts: Omit<TranscriptionScore, "precision" | "recall" | "f1">): TranscriptionScore {
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = counts;
  return { ...counts,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    f1: 2 * tp + fp + fn === 0 ? 1 : (2 * tp) / (2 * tp + fp + fn) };
}

export function scoreTranscription(reference: readonly MelodyNote[], predicted: readonly MelodyNote[],
  options: ScoreOptions = {}): TranscriptionScore {
  const tolerance = options.onsetToleranceTicks ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError(`Invalid onset tolerance: ${tolerance}`);
  reference.forEach(assertMelodyNote); predicted.forEach(assertMelodyNote);
  const usedReference = new Set<number>(), usedPredicted = new Set<number>();
  const matches = pair(reference, predicted, usedReference, usedPredicted, tolerance, (a, b) => a.midi === b.midi);
  const durationMatches = matches.filter((m) => reference[m.reference]!.durationTicks === predicted[m.predicted]!.durationTicks).length;
  // What is left at a shared onset is a wrong pitch; classify it, but it stays one miss plus one extra.
  const wrong = pair(reference, predicted, usedReference, usedPredicted, tolerance, () => true);
  const octaveErrors = wrong.filter((m) => (reference[m.reference]!.midi - predicted[m.predicted]!.midi) % 12 === 0).length;
  return finish({ referenceCount: reference.length, predictedCount: predicted.length, truePositives: matches.length,
    falsePositives: predicted.length - matches.length, falseNegatives: reference.length - matches.length,
    octaveErrors, pitchErrors: wrong.length - octaveErrors, durationMatches });
}

/** Micro average: counts are summed across cases and the ratios recomputed, so long cases weigh more than short ones. */
export function aggregateTranscriptionScores(scores: readonly TranscriptionScore[]): TranscriptionScore {
  const sum = (key: keyof TranscriptionScore) => scores.reduce((total, score) => total + score[key], 0);
  return finish({ referenceCount: sum("referenceCount"), predictedCount: sum("predictedCount"), truePositives: sum("truePositives"),
    falsePositives: sum("falsePositives"), falseNegatives: sum("falseNegatives"), octaveErrors: sum("octaveErrors"),
    pitchErrors: sum("pitchErrors"), durationMatches: sum("durationMatches") });
}
