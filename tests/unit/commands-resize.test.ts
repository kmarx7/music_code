import { describe, expect, it } from "vitest";
import { applyEditCommand } from "@/domain/commands/apply";
import { createEmptyScore, createNoteEvent } from "@/domain/score/create";
import { validateScore } from "@/domain/score/validate";
import type { Score } from "@/domain/score/types";

const CREATED_AT = "2026-11-07T00:00:00.000Z";
const TICKS_PER_MEASURE = 3840;

function scoreWithQuarterNotes(counts: number[]): Score {
  const score = createEmptyScore({
    id: "score-r",
    measureCount: counts.length,
    createdAt: CREATED_AT,
  });
  const part = score.parts[0];

  return {
    ...score,
    parts: [
      {
        ...part,
        measures: part.measures.map((measure, index) => ({
          ...measure,
          events: Array.from({ length: counts[index] ?? 0 }, (_, position) =>
            createNoteEvent({
              id: `m${index}n${position}`,
              step: "C",
              octave: 4,
              startTick: index * TICKS_PER_MEASURE + position * 960,
              durationTicks: 960,
            }),
          ),
        })),
      },
    ],
  };
}

function eventIdsByMeasure(score: Score): string[][] {
  return score.parts[0].measures.map((measure) =>
    measure.events.map((event) => event.id),
  );
}

function partId(score: Score): string {
  return score.parts[0].id;
}

describe("AddMeasure", () => {
  it("appends an empty measure with a stable index", () => {
    const score = scoreWithQuarterNotes([1]);
    const result = applyEditCommand(score, {
      type: "AddMeasure",
      partId: partId(score),
      measureId: "new-measure",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const measures = result.score.parts[0].measures;
      expect(measures).toHaveLength(2);
      expect(measures[1].id).toBe("new-measure");
      expect(measures[1].index).toBe(1);
      expect(measures[1].events).toHaveLength(0);
    }
  });

  it("rejects a duplicate measure id", () => {
    const score = scoreWithQuarterNotes([1]);
    const result = applyEditCommand(score, {
      type: "AddMeasure",
      partId: partId(score),
      measureId: score.parts[0].measures[0].id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DUPLICATE_ID");
  });
});

describe("ResizeNote", () => {
  it("lengthens the last note when the measure has room", () => {
    const score = scoreWithQuarterNotes([2]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "m0n1",
      durationTicks: 1920,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.score.parts[0].measures[0].events;
      expect(events).toHaveLength(2);
      expect(events[1].durationTicks).toBe(1920);
    }
  });

  it("reflows following notes into the next measure when pushing past the boundary", () => {
    const score = scoreWithQuarterNotes([4, 2]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "m0n0",
      durationTicks: 1920,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(validateScore(result.score)).toEqual([]);
      const ids = eventIdsByMeasure(result.score);
      expect(ids[0]).toEqual(["m0n0", "m0n1", "m0n2"]);
      expect(ids[1]).toEqual(["m0n3", "m1n0", "m1n1"]);
    }
  });

  it("fails when the last measure has no space (needs AddMeasure)", () => {
    const score = scoreWithQuarterNotes([4]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "m0n0",
      durationTicks: 1920,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MEASURE_CAPACITY_EXCEEDED");
  });

  it("compacts following notes when shortening", () => {
    const score = scoreWithQuarterNotes([4]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "m0n2",
      durationTicks: 480,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.score.parts[0].measures[0].events;
      const resized = events.find((event) => event.id === "m0n2");
      const last = events.find((event) => event.id === "m0n3");
      expect(resized?.durationTicks).toBe(480);
      expect(last?.startTick).toBe(1920 + 480);
    }
  });

  it("rejects an invalid duration", () => {
    const score = scoreWithQuarterNotes([2]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "m0n0",
      durationTicks: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DURATION");
  });

  it("reports a missing note", () => {
    const score = scoreWithQuarterNotes([2]);
    const result = applyEditCommand(score, {
      type: "ResizeNote",
      partId: partId(score),
      noteId: "missing",
      durationTicks: 960,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOTE_NOT_FOUND");
  });
});
