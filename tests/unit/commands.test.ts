import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands/apply";
import { createNoteEvent, createRestEvent } from "@/domain/score/create";
import { countNotes, fourNoteScore } from "../../tests/fixtures/scores";

function partAndMeasure(score: ReturnType<typeof fourNoteScore>, index = 0) {
  const part = score.parts[0];
  return { partId: part.id, measureId: part.measures[index].id };
}

describe("applyEditCommand — AddNote", () => {
  it("adds a note into an empty measure", () => {
    const score = fourNoteScore();
    const { partId, measureId } = partAndMeasure(score, 1);
    const note = createNoteEvent({
      id: "n5",
      step: "A",
      octave: 4,
      startTick: 3840,
      durationTicks: 960,
    });

    const result = applyEditCommand(score, { type: "AddNote", partId, measureId, note });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(countNotes(result.score)).toBe(5);
    }
  });

  it("does not mutate the source score", () => {
    const score = fourNoteScore();
    const before = JSON.stringify(score);
    const { partId, measureId } = partAndMeasure(score, 1);
    applyEditCommand(score, {
      type: "AddNote",
      partId,
      measureId,
      note: createNoteEvent({ id: "n5", step: "A", octave: 4, startTick: 3840, durationTicks: 960 }),
    });
    expect(JSON.stringify(score)).toBe(before);
  });

  it("rejects a duplicate note id", () => {
    const score = fourNoteScore();
    const { partId, measureId } = partAndMeasure(score, 1);
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId,
      measureId,
      note: createNoteEvent({ id: "n1", step: "A", octave: 4, startTick: 3840, durationTicks: 960 }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE_ID");
  });

  it("rejects a note that overlaps an existing event", () => {
    const score = fourNoteScore();
    const { partId, measureId } = partAndMeasure(score, 0);
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId,
      measureId,
      note: createNoteEvent({ id: "n9", step: "A", octave: 4, startTick: 0, durationTicks: 960 }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SCORE");
  });

  it("reports a missing measure", () => {
    const score = fourNoteScore();
    const { partId } = partAndMeasure(score, 0);
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId,
      measureId: "missing",
      note: createNoteEvent({ id: "n9", step: "A", octave: 4, startTick: 0, durationTicks: 960 }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEASURE_NOT_FOUND");
  });
});

describe("applyEditCommand — UpdateNote", () => {
  it("updates pitch and duration", () => {
    const score = fourNoteScore();
    const { partId } = partAndMeasure(score);
    const result = applyEditCommand(score, {
      type: "UpdateNote",
      partId,
      noteId: "n1",
      patch: { pitch: { midi: 62, step: "D", alter: 0, octave: 4 }, durationTicks: 480 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const event = result.score.parts[0].measures[0].events.find((e) => e.id === "n1");
      expect(event?.kind).toBe("note");
      if (event?.kind === "note") {
        expect(event.pitch.midi).toBe(62);
        expect(event.durationTicks).toBe(480);
      }
    }
  });

  it("rejects a spelling/MIDI mismatch", () => {
    const score = fourNoteScore();
    const { partId } = partAndMeasure(score);
    const result = applyEditCommand(score, {
      type: "UpdateNote",
      partId,
      noteId: "n1",
      patch: { pitch: { midi: 61, step: "C", alter: 0, octave: 4 } },
    });

    expect(result.ok).toBe(false);
  });

  it("reports a missing note", () => {
    const score = fourNoteScore();
    const { partId } = partAndMeasure(score);
    const result = applyEditCommand(score, {
      type: "UpdateNote",
      partId,
      noteId: "nope",
      patch: { durationTicks: 480 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOTE_NOT_FOUND");
  });
});

describe("applyEditCommand — DeleteEvent / InsertRest", () => {
  it("deletes an event", () => {
    const score = fourNoteScore();
    const { partId } = partAndMeasure(score);
    const result = applyEditCommand(score, { type: "DeleteEvent", partId, eventId: "n4" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(countNotes(result.score)).toBe(3);
  });

  it("inserts a rest", () => {
    const score = fourNoteScore();
    const { partId, measureId } = partAndMeasure(score, 1);
    const result = applyEditCommand(score, {
      type: "InsertRest",
      partId,
      measureId,
      rest: createRestEvent({ id: "r1", startTick: 3840, durationTicks: 3840 }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.score.parts[0].measures[1].events;
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("rest");
    }
  });
});
