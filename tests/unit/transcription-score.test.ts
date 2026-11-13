import { describe, expect, it } from "vitest";
import { aggregateTranscriptionScores, scoreTranscription, type MelodyNote } from "../fixtures/transcription-score";

const Q = 960;
const note = (midi: number, beat: number, beats = 1): MelodyNote => ({ midi, startTick: beat * Q, durationTicks: beats * Q });
const reference = [note(60, 0), note(62, 1), note(64, 2), note(65, 3)];

describe("scoreTranscription", () => {
  it("scores an exact transcription as perfect", () => {
    expect(scoreTranscription(reference, reference.map((item) => ({ ...item })))).toEqual({
      referenceCount: 4, predictedCount: 4, truePositives: 4, falsePositives: 0, falseNegatives: 0,
      precision: 1, recall: 1, f1: 1, octaveErrors: 0, pitchErrors: 0, durationMatches: 4,
    });
  });

  it("counts a missing note against recall only and an extra note against precision only", () => {
    const missing = scoreTranscription(reference, reference.slice(0, 3));
    expect(missing).toMatchObject({ truePositives: 3, falsePositives: 0, falseNegatives: 1, precision: 1, recall: 0.75 });
    expect(missing.f1).toBeCloseTo(6 / 7, 10);
    const extra = scoreTranscription(reference, [...reference, note(67, 4)]);
    expect(extra).toMatchObject({ truePositives: 4, falsePositives: 1, falseNegatives: 0, precision: 0.8, recall: 1 });
    expect(extra.f1).toBeCloseTo(8 / 9, 10);
  });

  it("separates octave errors from other pitch errors; both are a miss and an extra", () => {
    const score = scoreTranscription(reference, [note(60, 0), note(74, 1), note(63, 2), note(65, 3)]);
    expect(score).toMatchObject({ truePositives: 2, falsePositives: 2, falseNegatives: 2, octaveErrors: 1, pitchErrors: 1 });
    expect(score.f1).toBe(0.5);
  });

  it("requires the same onset grid position by default and accepts a tolerance when given", () => {
    const late = [note(60, 0), { midi: 62, startTick: Q + 120, durationTicks: Q }];
    expect(scoreTranscription(reference.slice(0, 2), late)).toMatchObject({ truePositives: 1, octaveErrors: 0, pitchErrors: 0 });
    expect(scoreTranscription(reference.slice(0, 2), late, { onsetToleranceTicks: 120 })).toMatchObject({ truePositives: 2 });
    expect(scoreTranscription(reference.slice(0, 2), late, { onsetToleranceTicks: 119 })).toMatchObject({ truePositives: 1 });
  });

  it("matches one to one: a repeated prediction of the same note is an extra, and the nearest onset wins", () => {
    expect(scoreTranscription([note(60, 0)], [note(60, 0), note(60, 0)])).toMatchObject({ truePositives: 1, falsePositives: 1 });
    const repeated = [note(60, 0), note(60, 1)];
    const shifted = [{ midi: 60, startTick: 40, durationTicks: Q }, { midi: 60, startTick: Q - 40, durationTicks: Q }];
    expect(scoreTranscription(repeated, shifted, { onsetToleranceTicks: Q })).toMatchObject({ truePositives: 2, falsePositives: 0 });
  });

  it("reports how many matched notes also have the exact duration, without changing F1", () => {
    const score = scoreTranscription(reference, [note(60, 0, 0.5), note(62, 1), note(64, 2), note(65, 3, 2)]);
    expect(score).toMatchObject({ truePositives: 4, f1: 1, durationMatches: 2 });
  });

  it("defines empty cases: nothing expected and nothing found is perfect, otherwise zero", () => {
    expect(scoreTranscription([], [])).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    expect(scoreTranscription(reference, [])).toMatchObject({ precision: 1, recall: 0, f1: 0, falseNegatives: 4 });
    expect(scoreTranscription([], reference)).toMatchObject({ precision: 0, recall: 1, f1: 0, falsePositives: 4 });
  });

  it("does not depend on input order and never mutates its inputs", () => {
    const predicted = [note(65, 3), note(60, 0), note(64, 2), note(62, 1)];
    const before = JSON.stringify([reference, predicted]);
    expect(scoreTranscription([...reference].reverse(), predicted).f1).toBe(1);
    expect(JSON.stringify([reference, predicted])).toBe(before);
  });

  it("rejects malformed notes instead of scoring them", () => {
    for (const bad of [{ midi: 60.5, startTick: 0, durationTicks: Q }, { midi: 60, startTick: -1, durationTicks: Q },
      { midi: 60, startTick: 0, durationTicks: 0 }, { midi: 128, startTick: 0, durationTicks: Q },
      { midi: 60, startTick: Number.NaN, durationTicks: Q }]) {
      expect(() => scoreTranscription(reference, [bad])).toThrow(RangeError);
      expect(() => scoreTranscription([bad], reference)).toThrow(RangeError);
    }
    expect(() => scoreTranscription(reference, reference, { onsetToleranceTicks: -1 })).toThrow(RangeError);
  });
});

describe("aggregateTranscriptionScores", () => {
  it("adds counts across cases (micro average) rather than averaging per-case F1", () => {
    const perfect = scoreTranscription(reference, reference);
    const empty = scoreTranscription([note(60, 0)], []);
    const total = aggregateTranscriptionScores([perfect, empty]);
    expect(total).toMatchObject({ referenceCount: 5, predictedCount: 4, truePositives: 4, falsePositives: 0, falseNegatives: 1,
      precision: 1, recall: 0.8, durationMatches: 4 });
    expect(total.f1).toBeCloseTo(8 / 9, 10);
    expect(aggregateTranscriptionScores([])).toMatchObject({ referenceCount: 0, f1: 1 });
  });
});
