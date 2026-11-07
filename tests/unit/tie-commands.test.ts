import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands/apply";
import { createEmptyScore, createNoteEvent } from "@/domain/score/create";
import { deserializeScore, serializeScore } from "@/domain/score/serialize";
import { validateScore } from "@/domain/score/validate";
import { createScoreStore } from "@/store/score-store";
import type { Score } from "@/domain/score/types";

const CREATED_AT = "2026-11-07T00:00:00.000Z";

function emptyScore(measureCount: number): Score {
  return createEmptyScore({ id: "s", measureCount, createdAt: CREATED_AT });
}

/** 4/4 첫 마디에 4분음표 3개(0·960·1920)를 넣고, 마디를 넘는 2박 음을 2880에 붙인 score. */
function scoreWithCrossingNote(measureCount = 2): Score {
  let score = emptyScore(measureCount);
  const partId = score.parts[0].id;

  for (let index = 0; index < 3; index += 1) {
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId,
      measureId: "s:m:0",
      note: createNoteEvent({
        id: `n${index}`,
        step: "C",
        octave: 4,
        startTick: index * 960,
        durationTicks: 960,
      }),
    });
    if (!result.ok) throw new Error("fixture add failed");
    score = result.score;
  }

  const crossing = applyEditCommand(score, {
    type: "AddNote",
    partId,
    measureId: "s:m:0",
    note: createNoteEvent({
      id: "cross",
      step: "G",
      octave: 4,
      startTick: 2880,
      durationTicks: 1920,
    }),
  });
  if (!crossing.ok) throw new Error("fixture crossing note failed");
  return crossing.score;
}

function tiesOf(score: Score) {
  return score.parts[0].ties;
}

describe("AddNote with a note that crosses a barline", () => {
  it("keeps note counts stable when a brief note fits", () => {
    const score = scoreWithCrossingNote();
    expect(validateScore(score)).toEqual([]);
  });

  it("reports MEASURE_CAPACITY_EXCEEDED when the note runs past the last measure", () => {
    const score = emptyScore(1);
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId: score.parts[0].id,
      measureId: "s:m:0",
      note: createNoteEvent({
        id: "long",
        step: "C",
        octave: 4,
        startTick: 2880,
        durationTicks: 1920,
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEASURE_CAPACITY_EXCEEDED");
  });

  it("rejects a note whose start tick is outside the target measure", () => {
    const score = emptyScore(2);
    const result = applyEditCommand(score, {
      type: "AddNote",
      partId: score.parts[0].id,
      measureId: "s:m:0",
      note: createNoteEvent({
        id: "far",
        step: "C",
        octave: 4,
        startTick: 3840,
        durationTicks: 960,
      }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEASURE_NOT_FOUND");
  });
});

describe("commands on tied notes", () => {
  it("removes the dangling link when a segment is deleted", () => {
    const score = scoreWithCrossingNote();
    const before = tiesOf(score);
    expect(before).toHaveLength(1);

    const result = applyEditCommand(score, {
      type: "DeleteEvent",
      partId: score.parts[0].id,
      eventId: before[0].to,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(tiesOf(result.score)).toEqual([]);
      expect(validateScore(result.score)).toEqual([]);
    }
  });

  it("applies a pitch change to every segment of the chain", () => {
    const score = scoreWithCrossingNote();
    const link = tiesOf(score)[0];

    const result = applyEditCommand(score, {
      type: "UpdateNote",
      partId: score.parts[0].id,
      noteId: link.to,
      patch: { pitch: { midi: 67, step: "G", alter: 0, octave: 4 } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const notes = result.score.parts[0].measures.flatMap(
        (measure) => measure.events,
      );
      const linked = notes.filter(
        (event) => event.kind === "note" && event.id.startsWith("cross"),
      );
      expect(linked).toHaveLength(2);
      expect(new Set(linked.map((event) => (event.kind === "note" ? event.pitch.midi : 0)))).toEqual(
        new Set([67]),
      );
      expect(validateScore(result.score)).toEqual([]);
    }
  });

  it("rejects position/length patches on a tied note", () => {
    const score = scoreWithCrossingNote();
    const result = applyEditCommand(score, {
      type: "UpdateNote",
      partId: score.parts[0].id,
      noteId: "cross",
      patch: { durationTicks: 480 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TIE_EDIT_UNSUPPORTED");
  });

  it("rebuilds the chain when the length shrinks back into one measure", () => {
    const score = scoreWithCrossingNote();
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: score.parts[0].id,
      noteId: "cross",
      durationTicks: 960,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(tiesOf(result.score)).toEqual([]);
      expect(validateScore(result.score)).toEqual([]);
    }
  });

  it("resizes a continuation segment by rebuilding the whole logical note", () => {
    const score = scoreWithCrossingNote();
    const link = tiesOf(score)[0];
    expect(link.from).toBe("cross");

    // 논리 음표는 head(2880)에서 시작하므로 2880 tick = 960(m0) + 1920(m1)로 재분할된다.
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: score.parts[0].id,
      noteId: link.to,
      durationTicks: 2880,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validateScore(result.score)).toEqual([]);
      expect(tiesOf(result.score)).toHaveLength(1);
      const segments = result.score.parts[0].measures.flatMap((measure) =>
        measure.events
          .filter((event) => event.id === "cross" || event.id.startsWith("cross:"))
          .map((event) => ({ id: event.id, startTick: event.startTick, durationTicks: event.durationTicks })),
      );
      expect(segments).toEqual([
        { id: "cross", startTick: 2880, durationTicks: 960 },
        { id: "cross:tie1", startTick: 3840, durationTicks: 1920 },
      ]);
    }
  });
});

describe("tie persistence and history", () => {
  it("round-trips ties through serialization", () => {
    const score = scoreWithCrossingNote();
    const result = deserializeScore(serializeScore(score));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(false);
      expect(result.score.parts[0].ties).toEqual(tiesOf(score));
      expect(result.score).toEqual(score);
    }
  });

  it("restores tie data through undo and re-applies it through redo", () => {
    const store = createScoreStore();
    const score = scoreWithCrossingNote();
    const originalTies = tiesOf(score);
    expect(originalTies).toHaveLength(1);

    store.init(score);
    const result = store.dispatch({
      type: "ResizeNote",
      partId: score.parts[0].id,
      noteId: "cross",
      durationTicks: 960,
    });
    expect(result?.ok).toBe(true);
    expect(store.getState()?.current.parts[0].ties).toEqual([]);

    store.undo();
    expect(store.getState()?.current.parts[0].ties).toEqual(originalTies);

    store.redo();
    expect(store.getState()?.current.parts[0].ties).toEqual([]);
  });
});
