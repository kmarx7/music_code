import { describe, expect, it } from "vitest";
import { applyEditCommand, type CommandResult } from "@/domain/commands";
import { createEmptyScore, createNoteEvent, createRestEvent, validateScore, type ClipboardPayload, type Score } from "@/domain/score";

const BAR = 3840;
const empty = (measures: number) => createEmptyScore({ id: "s", measureCount: measures, createdAt: "2026-11-13T00:00:00.000Z" });
/** Two bars: a whole note, then a half rest and a half note. */
const payload: ClipboardPayload = {
  lengthTicks: 2 * BAR,
  events: [
    createNoteEvent({ id: "n1", step: "C", octave: 4, startTick: 0, durationTicks: BAR }),
    createRestEvent({ id: "r1", startTick: BAR, durationTicks: BAR / 2 }),
    createNoteEvent({ id: "n2", step: "E", octave: 4, startTick: BAR + BAR / 2, durationTicks: BAR / 2 }),
  ],
  ties: [],
};
const paste = (score: Score, startTick: number, newMeasureIds?: readonly string[]): CommandResult =>
  applyEditCommand(score, { type: "PasteEvents", partId: score.parts[0].id, startTick, clipboard: payload, ...(newMeasureIds ? { newMeasureIds } : {}) });

describe("PasteEvents with newMeasureIds", () => {
  it("still refuses a paste that does not fit when no new measure IDs are given", () => {
    expect(paste(empty(1), 0)).toMatchObject({ ok: false, error: { code: "MEASURE_CAPACITY_EXCEEDED" } });
  });

  it("appends exactly the measures it needs, with the given IDs, and pastes in the same command", () => {
    const result = paste(empty(1), 0, ["m-new-1", "m-new-2", "m-new-3"]);
    expect(result.ok).toBe(true);
    const part = (result as { score: Score }).score.parts[0];
    expect(part.measures.map((measure) => [measure.id === "m-new-1" || measure.id === "m-new-2" ? measure.id : "old", measure.index]))
      .toEqual([["old", 0], ["m-new-1", 1]]);
    expect(part.measures[1].events.map((event) => event.id)).toEqual(["r1", "n2"]);
    expect(validateScore((result as { score: Score }).score)).toEqual([]);
  });

  it("adds no measure when the paste already fits", () => {
    const result = paste(empty(2), 0, ["m-new-1"]);
    expect((result as { score: Score }).score.parts[0].measures).toHaveLength(2);
  });

  it("fails without any change when too few IDs are given, or an ID is already used or repeated", () => {
    const score = empty(1);
    const before = JSON.stringify(score);
    expect(paste(score, BAR / 2, ["m-new-1"])).toMatchObject({ ok: false, error: { code: "MEASURE_CAPACITY_EXCEEDED" } });
    expect(paste(score, 0, [score.parts[0].measures[0].id])).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
    expect(paste(score, BAR / 2, ["m-x", "m-x"])).toMatchObject({ ok: false, error: { code: "DUPLICATE_ID" } });
    expect(JSON.stringify(score)).toBe(before);
  });

  it("keeps the empty-target rule: an occupied target fails even if measures could be added", () => {
    const first = paste(empty(2), 0) as { ok: true; score: Score };
    const again = applyEditCommand(first.score, { type: "PasteEvents", partId: first.score.parts[0].id, startTick: BAR,
      clipboard: { ...payload, events: payload.events.map((event) => ({ ...event, id: `${event.id}-b` })) }, newMeasureIds: ["m-a"] });
    expect(again).toMatchObject({ ok: false, error: { code: "PASTE_TARGET_OCCUPIED" } });
  });
});
