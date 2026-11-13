import { describe, expect, it } from "vitest";
import { planTranscriptionCommit } from "@/application";
import { applyEditCommand } from "@/domain/commands";
import { createEmptyScore, createNoteEvent, validateScore, type ClipboardPayload, type Score } from "@/domain/score";

const BAR = 3840;
const ids = () => { let next = 0; return () => `m-${next++}`; };
const take: ClipboardPayload = {
  lengthTicks: BAR + 960,
  events: [createNoteEvent({ id: "t1", step: "G", octave: 4, startTick: 0, durationTicks: BAR + 960 })],
  ties: [],
};
function withNoteUntil(endTick: number, measures: number): Score {
  const score = createEmptyScore({ id: "s", measureCount: measures, createdAt: "2026-11-13T00:00:00.000Z" });
  const note = createNoteEvent({ id: "e1", step: "C", octave: 4, startTick: endTick - 960, durationTicks: 960 });
  const measureIndex = Math.floor((endTick - 960) / BAR);
  return { ...score, parts: [{ ...score.parts[0], measures: score.parts[0].measures.map((measure, index) =>
    index === measureIndex ? { ...measure, events: [note] } : measure) }] };
}

describe("planTranscriptionCommit", () => {
  it("appends after the last measure that holds an event, adding the measures the take needs", () => {
    const score = withNoteUntil(BAR + 960, 2); // ends inside measure 2
    const plan = planTranscriptionCommit(score, take, { target: "end", cursorTick: null, nextMeasureId: ids() });
    expect(plan).toMatchObject({ ok: true, startMeasure: 3 });
    if (!plan.ok) return;
    expect(plan.command).toMatchObject({ type: "PasteEvents", startTick: 2 * BAR, newMeasureIds: ["m-0", "m-1"] });
    const result = applyEditCommand(score, plan.command);
    expect(result.ok && validateScore(result.score)).toEqual([]);
    expect(result.ok && result.score.parts[0].measures).toHaveLength(4);
  });

  it("starts an empty score at measure 1 and adds nothing when the take fits", () => {
    const score = createEmptyScore({ id: "s", measureCount: 4, createdAt: "2026-11-13T00:00:00.000Z" });
    expect(planTranscriptionCommit(score, take, { target: "end", cursorTick: null, nextMeasureId: ids() }))
      .toMatchObject({ ok: true, startMeasure: 1, command: { startTick: 0, newMeasureIds: [] } });
  });

  it("starts at the beginning of the cursor's measure", () => {
    const score = createEmptyScore({ id: "s", measureCount: 4, createdAt: "2026-11-13T00:00:00.000Z" });
    expect(planTranscriptionCommit(score, take, { target: "cursor", cursorTick: 2 * BAR + 480, nextMeasureId: ids() }))
      .toMatchObject({ ok: true, startMeasure: 3, command: { startTick: 2 * BAR, newMeasureIds: [] } });
  });

  it("asks for a cursor when inserting at the cursor without one, and refuses an empty take", () => {
    const score = createEmptyScore({ id: "s", measureCount: 4, createdAt: "2026-11-13T00:00:00.000Z" });
    expect(planTranscriptionCommit(score, take, { target: "cursor", cursorTick: null, nextMeasureId: ids() }))
      .toMatchObject({ ok: false });
    expect(planTranscriptionCommit(score, { lengthTicks: 0, events: [], ties: [] }, { target: "end", cursorTick: null, nextMeasureId: ids() }))
      .toMatchObject({ ok: false });
  });
});
