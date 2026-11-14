import { describe, expect, it } from "vitest";
import { createEmptyScore, measureTicks, type Score } from "@/domain/score";
import { applyEditCommand } from "@/domain/commands";
import { createPitch } from "@/domain/music-theory/pitch";
import { planAppendNote, planAppendRest, planNoteAt } from "@/application/append-note";

const at = "2026-11-15T00:00:00.000Z";
const C4 = createPitch("C", 0, 4);
const ids = () => { let n = 0; return () => `m-new-${++n}`; };
function filled(measureCount: number, numerator = 4): Score {
  let score = createEmptyScore({ id: "s", createdAt: at, measureCount, timeSignature: { numerator, denominator: 4 } });
  for (let index = 0; index < measureCount * numerator; index += 1) {
    const plan = planAppendNote(score, { pitch: C4, durationTicks: 960, id: `n${index}` });
    if (!plan.ok) throw new Error(plan.message);
    const applied = applyEditCommand(score, plan.command);
    if (!applied.ok) throw new Error(applied.error.message);
    score = applied.score;
  }
  return score;
}
const apply = (score: Score, plan: ReturnType<typeof planAppendNote>) => {
  if (!plan.ok) throw new Error(plan.message);
  const result = applyEditCommand(score, plan.command);
  if (!result.ok) throw new Error(result.error.message);
  return result.score;
};

describe("Appending at the end of a full score adds a measure in the same command (UAT fix, option A)", () => {
  it("adds one measure and puts the note at its start: one command, so one Undo", () => {
    const score = filled(2);
    const plan = planAppendNote(score, { pitch: C4, durationTicks: 960, id: "late", nextMeasureId: ids() });
    expect(plan).toMatchObject({ ok: true, command: { type: "PasteEvents", startTick: 2 * measureTicks(score.parts[0].timeSignature), newMeasureIds: ["m-new-1"] } });
    const next = apply(score, plan);
    expect(next.parts[0].measures.map((measure) => measure.id)).toEqual([...score.parts[0].measures.map((measure) => measure.id), "m-new-1"]);
    expect(next.parts[0].measures[2].events).toMatchObject([{ id: "late", kind: "note", startTick: 7680, durationTicks: 960,
      pitch: { midi: 60 }, provenance: { source: "piano" } }]);
    expect(next.parts[0].measures.slice(0, 2)).toEqual(score.parts[0].measures);
  });

  it("a note that runs past the last bar line is tied into the new measure", () => {
    const base = createEmptyScore({ id: "s", createdAt: at, measureCount: 1 });
    const three = [0, 1, 2].reduce((score, index) => apply(score, planAppendNote(score, { pitch: C4, durationTicks: 960, id: `q${index}` })), base);
    const plan = planAppendNote(three, { pitch: C4, durationTicks: 1920, id: "half", nextMeasureId: ids() });
    const next = apply(three, plan);
    expect(next.parts[0].measures).toHaveLength(2);
    expect(next.parts[0].ties).toHaveLength(1);
  });

  it("adds as many measures as a long note needs, and only those", () => {
    const score = filled(1, 1);
    const plan = planAppendNote(score, { pitch: C4, durationTicks: 3840, id: "whole", nextMeasureId: ids() });
    expect(plan).toMatchObject({ ok: true, command: { newMeasureIds: ["m-new-1", "m-new-2", "m-new-3", "m-new-4"] } });
    expect(apply(score, plan).parts[0].measures).toHaveLength(5);
  });

  it("does the same for a rest at the end", () => {
    const score = filled(1);
    const plan = planAppendRest(score, { durationTicks: 960, id: "r", nextMeasureId: ids() });
    const next = apply(score, plan);
    expect(next.parts[0].measures).toHaveLength(2);
    expect(next.parts[0].measures[1].events).toMatchObject([{ id: "r", kind: "rest", startTick: 3840 }]);
  });

  it("leaves everything else as before: room left → AddNote, no factory → refusal, cursor input → refusal", () => {
    const roomy = createEmptyScore({ id: "s", createdAt: at, measureCount: 2 });
    expect(planAppendNote(roomy, { pitch: C4, durationTicks: 960, id: "a", nextMeasureId: ids() })).toMatchObject({ ok: true, command: { type: "AddNote" } });
    const full = filled(1);
    expect(planAppendNote(full, { pitch: C4, durationTicks: 960, id: "b" })).toMatchObject({ ok: false });
    expect(planNoteAt(full, { pitch: C4, durationTicks: 960, id: "c", startTick: 3840 })).toMatchObject({ ok: false });
  });
});
