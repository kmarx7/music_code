import { describe, expect, it } from "vitest";
import { createEmptyScore, createNoteEvent, measureTicks, type Score } from "@/domain/score";
import { compactStaffScore } from "@/features/score-editor";

const at = "2026-11-15T00:00:00.000Z";
/** An 8-measure 4/4 score (two staff rows of four) with one note in the given measure. */
function eightMeasures(noteMeasure: number | null): Score {
  const score = createEmptyScore({ id: "s", createdAt: at, measureCount: 8 });
  if (noteMeasure === null) return score;
  const ticks = measureTicks(score.parts[0].timeSignature);
  const note = createNoteEvent({ id: "n", step: "C", octave: 4, startTick: noteMeasure * ticks, durationTicks: 960 });
  return { ...score, parts: score.parts.map((part) => ({ ...part,
    measures: part.measures.map((measure, index) => (index === noteMeasure ? { ...measure, events: [note] } : measure)) })) };
}
const measureCount = (score: Score) => score.parts[0].measures.length;

describe("compactStaffScore: drop trailing staff rows that hold nothing (phone 다듬기)", () => {
  it("keeps only the first row when every note is in it", () => {
    const score = eightMeasures(2);
    const compact = compactStaffScore(score, null);
    expect(measureCount(compact)).toBe(4);
    expect(compact.parts[0].measures).toEqual(score.parts[0].measures.slice(0, 4));
    expect(compact.parts[0].ties).toBe(score.parts[0].ties);
    expect(measureCount(score)).toBe(8); // the source score is untouched
  });

  it("keeps the row holding the last note, and the row holding the edit cursor", () => {
    expect(measureCount(compactStaffScore(eightMeasures(5), null))).toBe(8);
    const ticks = measureTicks(eightMeasures(null).parts[0].timeSignature);
    expect(measureCount(compactStaffScore(eightMeasures(1), 6 * ticks))).toBe(8);
    // A cursor at the very end of the first row (the start of measure 5) still belongs to measure 5's row.
    expect(measureCount(compactStaffScore(eightMeasures(1), 4 * ticks))).toBe(8);
  });

  it("shows one row for an empty score, and returns the same object when nothing would be dropped", () => {
    expect(measureCount(compactStaffScore(eightMeasures(null), null))).toBe(4);
    const full = eightMeasures(7);
    expect(compactStaffScore(full, null)).toBe(full);
    const short = createEmptyScore({ id: "t", createdAt: at, measureCount: 3 });
    expect(compactStaffScore(short, null)).toBe(short);
  });

  it("counts rests as content, so a written rest is never hidden", () => {
    const score = eightMeasures(null);
    const ticks = measureTicks(score.parts[0].timeSignature);
    const withRest: Score = { ...score, parts: score.parts.map((part) => ({ ...part, measures: part.measures.map((measure, index) =>
      index === 6 ? { ...measure, events: [{ id: "r", kind: "rest" as const, startTick: 6 * ticks, durationTicks: 960 }] } : measure) })) };
    expect(measureCount(compactStaffScore(withRest, null))).toBe(8);
  });
});
